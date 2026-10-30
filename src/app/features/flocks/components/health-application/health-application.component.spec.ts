import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { healthActivity, healthFlock, healthPlan } from '../../testing/health-fixtures';
import { dateBefore, todayInLotsTimezone } from '../../services/flock-detail.service';
import { HealthApplicationComponent } from './health-application.component';

describe('Health application dialog', () => {
  let fixture: ComponentFixture<HealthApplicationComponent>;
  let component: HealthApplicationComponent;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: { user: signal({ name: 'María' }) } }] });
    fixture = TestBed.createComponent(HealthApplicationComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('flock', healthFlock);
    fixture.componentRef.setInput('plan', healthPlan);
    fixture.componentRef.setInput('vaccines', [{ value: 'vaccine-1', label: 'Vacuna A' }]);
    fixture.componentRef.setInput('medicines', [{ value: 'medicine-1', label: 'Medicamento A' }]);
    fixture.componentRef.setInput('dataReady', true);
    await fixture.whenStable();
    for (const dialog of fixture.nativeElement.querySelectorAll('dialog') as NodeListOf<HTMLDialogElement>) {
      dialog.showModal = vi.fn(() => { dialog.open = true; });
      dialog.close = vi.fn(() => { dialog.open = false; });
    }
    component.open();
    component.form.patchValue({ date: todayInLotsTimezone(), time: '00:00', product: 'vaccine-1' });
    await fixture.whenStable();
  });

  it('requires a nonblank reason outside the plan and confirms before emitting', async () => {
    const submitted = vi.fn(); component.submitted.subscribe(submitted);
    component.form.patchValue({ reason: '   ' });
    component.submit();
    expect(submitted).not.toHaveBeenCalled();
    expect(component.confirmation().nativeElement.open).toBe(false);
    component.form.patchValue({ reason: ' Indicación veterinaria ' });
    await fixture.whenStable(); component.submit();
    expect(component.confirmation().nativeElement.open).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
    component.back();
    expect(component.form.controls.reason.value).toBe(' Indicación veterinaria ');
    component.submit(); component.confirm(); component.confirm();
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted.mock.calls[0][0].body).toMatchObject({ vaccine_id: 'vaccine-1', reason: 'Indicación veterinaria' });
    expect(submitted.mock.calls[0][0].body).not.toHaveProperty('plan_activity_id');
  });

  it('links only a matching current activity on its date, with no required reason', async () => {
    const submitted = vi.fn(); component.submitted.subscribe(submitted);
    component.form.patchValue({ activity: healthActivity.id });
    await fixture.whenStable();
    expect(component.withinPlan()).toBe(true);
    component.submit();
    expect(submitted).toHaveBeenCalledOnce();
    expect(submitted.mock.calls[0][0].body).toMatchObject({ plan_activity_id: healthActivity.id });
    expect(submitted.mock.calls[0][0].body).not.toHaveProperty('reason');
    expect(component.confirmation().nativeElement.open).toBe(false);
  });

  it('updates the inline warning when the application date differs, omitting the stale link', async () => {
    const submitted = vi.fn(); component.submitted.subscribe(submitted);
    component.form.patchValue({ activity: healthActivity.id, date: dateBefore(todayInLotsTimezone(), 1), reason: 'Cambio de fecha' });
    await fixture.whenStable();
    expect(component.withinPlan()).toBe(false);
    expect(fixture.nativeElement.querySelector('.plan-status').textContent).toContain('La fecha no coincide');
    component.submit(); component.confirm();
    expect(submitted.mock.calls[0][0].body).not.toHaveProperty('plan_activity_id');
  });

  it('registers medicine without a quantity field or payload, and blocks future dates', async () => {
    const submitted = vi.fn(); component.submitted.subscribe(submitted);
    component.setKind('medication');
    component.form.patchValue({ product: 'medicine-1', reason: 'Tratamiento' });
    await fixture.whenStable(); component.submit(); component.confirm();
    expect(fixture.nativeElement.querySelector('input[name="quantity"], input[type="number"]')).toBeNull();
    expect(submitted.mock.calls[0][0]).toMatchObject({ kind: 'medication', body: { medicine_id: 'medicine-1' } });
    expect(submitted.mock.calls[0][0].body).not.toHaveProperty('quantity');
    component.form.patchValue({ date: '2099-01-01' });
    component.submit();
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(component.localError()).toContain('momento actual');
  });

  it('does not allow editing, closing or reconfirming an uncertain operation', async () => {
    fixture.componentRef.setInput('uncertain', true);
    await fixture.whenStable();
    const retry = vi.fn(); component.retried.subscribe(retry);
    component.close(new Event('cancel')); component.setKind('medication'); component.submit();
    expect(component.dialog().nativeElement.open).toBe(true);
    expect(component.kind()).toBe('vaccination');
    expect(retry).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
  });
});
