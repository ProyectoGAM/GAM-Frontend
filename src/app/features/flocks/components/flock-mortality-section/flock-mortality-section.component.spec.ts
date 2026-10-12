import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Flock } from '../../interfaces/flock.interface';
import { FlockMortality } from '../../interfaces/flock-mortality.interface';
import { MortalityChartComponent } from '../mortality-chart/mortality-chart.component';
import { FlockMortalitySectionComponent } from './flock-mortality-section.component';

const flock: Flock = { id: 'lot', code: 'L-024', breed_id: 1, supplier_id: null, supplier_name: null,
  origin: null, poultry_house_id: 3, production_unit_id: 1, initial_quantity: 100, current_quantity: 90,
  entry_date: '2026-09-01', established_at: '2026-09-01T12:00:00Z', age_days: 41, current_week: 6,
  is_grouped: false, status: 'active', version: 1, notes: null, finalized_at: null, finalization_reason: null };
const record: FlockMortality = { id: 'record-1', version: 2, quantity: 3, notes: 'Golpe de calor',
  occurred_at: '2026-10-12T12:00:00-03:00', status: 'recorded' };

describe('FlockMortalitySectionComponent', () => {
  function setup() {
    TestBed.overrideComponent(MortalityChartComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(FlockMortalitySectionComponent);
    fixture.componentRef.setInput('flock', flock);
    fixture.componentRef.setInput('today', '2026-10-12');
    fixture.componentRef.setInput('state', 'ready');
    fixture.detectChanges();
    return fixture;
  }

  it('uses required free text and validates blank reasons, dates and integer quantities', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dialog.showModal = vi.fn();
    component.openForm();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    component.form.setValue({ date: '2026-10-12', quantity: 3, reason: '   ' });
    component.form.controls.reason.markAsTouched();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea').required).toBe(true);
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(fixture.nativeElement.querySelector('#mortality-reason-error').textContent).toContain('no puede quedar vacío');
    component.form.controls.reason.setValue('Golpe de calor');
    fixture.detectChanges();
    expect(component.form.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    component.form.controls.quantity.setValue(1.5);
    expect(component.form.controls.quantity.invalid).toBe(true);
    component.form.controls.quantity.setValue(91);
    expect(component.form.controls.quantity.valid).toBe(true);
    component.form.controls.quantity.setValue(3);
    component.form.controls.date.setValue('2026-10-13');
    expect(component.form.controls.date.invalid).toBe(true);
    component.form.controls.date.setValue('2026-08-31');
    expect(component.form.controls.date.invalid).toBe(true);
  });

  it('requires explicit confirmation above the live count, allows cancellation, and submits the confirmed snapshot once', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const dialogs = fixture.nativeElement.querySelectorAll('dialog') as NodeListOf<HTMLDialogElement>;
    dialogs.forEach((dialog) => { dialog.showModal = vi.fn(); dialog.close = vi.fn(); });
    const submit = vi.fn();
    component.submitted.subscribe(submit);
    component.form.setValue({ date: '2026-10-12', quantity: 95, reason: 'Lesión' });
    component.submitForm();
    fixture.detectChanges();
    expect(submit).not.toHaveBeenCalled();
    const excess = fixture.nativeElement.querySelector('[aria-labelledby="mortality-excess-title"]');
    expect(excess.showModal).toHaveBeenCalledOnce();
    expect(excess.textContent).toContain('90 gallinas vivas');
    expect(component.confirmationExcess()).toBe(5);
    component.cancelExcess();
    expect(submit).not.toHaveBeenCalled();
    expect(component.form.controls.quantity.value).toBe(95);
    component.submitForm();
    component.confirmExcess();
    component.confirmExcess();
    expect(submit).toHaveBeenCalledExactlyOnceWith({ draft: { date: '2026-10-12', quantity: 95, reason: 'Lesión' },
      excessConfirmation: { version: 1, balance: 90 } });
  });

  it('records exactly the live count without excess confirmation and prevents submission while saving', () => {
    const fixture = setup();
    const submit = vi.fn();
    fixture.componentInstance.submitted.subscribe(submit);
    fixture.componentInstance.form.setValue({ date: '2026-10-12', quantity: 90, reason: 'Lesión' });
    fixture.componentInstance.submitForm();
    expect(submit).toHaveBeenCalledExactlyOnceWith({ draft: { date: '2026-10-12', quantity: 90, reason: 'Lesión' }, excessConfirmation: null });
    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();
    fixture.componentInstance.submitForm();
    const event = new Event('cancel', { cancelable: true });
    fixture.componentInstance.onDialogCancel(event);
    expect(event.defaultPrevented).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('shows zero live birds and the real negative balance and reconfirms if the flock changes', () => {
    const fixture = setup();
    fixture.componentRef.setInput('flock', { ...flock, current_quantity: -3, version: 2 });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('[aria-labelledby="mortality-excess-title"]');
    dialog.showModal = vi.fn(); dialog.close = vi.fn();
    const submit = vi.fn();
    component.submitted.subscribe(submit);
    component.form.setValue({ date: '2026-10-12', quantity: 1, reason: 'Lesión' });
    component.submitForm();
    fixture.detectChanges();
    expect(dialog.textContent).toContain('0 gallinas vivas');
    expect(dialog.textContent).toContain('1 muerte');
    expect(dialog.textContent).toContain('El saldo registrado del lote es -3');
    expect(component.confirmationExcess()).toBe(1);
    fixture.componentRef.setInput('flock', { ...flock, current_quantity: -5, version: 3 });
    fixture.detectChanges();
    component.confirmExcess();
    expect(submit).not.toHaveBeenCalled();
    expect(component.pendingConfirmation()?.balance).toBe(-5);
  });

  it('shows exact reasons without interpreting text as HTML and recalculates fixed period summaries', () => {
    const fixture = setup();
    fixture.componentRef.setInput('records', [{ id: '1', version: 1, quantity: 4, occurred_at: '2026-10-07T12:00:00Z',
      notes: '<img src=x onerror=alert(1)>', status: 'recorded' },
    { id: '2', version: 1, quantity: 7, occurred_at: '2026-09-10T12:00:00Z', notes: 'Lesión', status: 'recorded' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('<img src=x onerror=alert(1)>');
    expect(fixture.nativeElement.querySelector('tbody img')).toBeNull();
    expect(fixture.componentInstance.leaders()[0].quantity).toBe(4);
    fixture.componentInstance.changePeriod('month');
    fixture.detectChanges();
    expect(fixture.componentInstance.leaders()[0]).toEqual({ reason: 'Lesión', quantity: 7 });
    expect(fixture.nativeElement.querySelectorAll('.period-filter input')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('reports inaccessible data distinctly and offers retry without fabricating zeros', () => {
    const fixture = setup();
    fixture.componentRef.setInput('state', 'forbidden');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No tenés permiso para consultar');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.nativeElement.querySelector('.page-state button').click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('opens undo with the original details, requires a text reason and cancels without submitting', () => {
    const fixture = setup();
    fixture.componentRef.setInput('records', [record]);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('[aria-labelledby="mortality-cancellation-title"]');
    dialog.showModal = vi.fn(); dialog.close = vi.fn();
    const submit = vi.fn();
    component.cancellationSubmitted.subscribe(submit);
    fixture.nativeElement.querySelector('.undo-button').click();
    fixture.detectChanges();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.textContent).toContain('Golpe de calor');
    expect(dialog.textContent).toContain('3 gallinas al saldo del lote');
    expect(dialog.textContent).toContain('quedará auditada');
    expect(dialog.querySelector('button[autofocus]')?.textContent).toContain('Cancelar');
    component.cancellationForm.controls.reason.setValue('   ');
    component.submitCancellation();
    expect(submit).not.toHaveBeenCalled();
    component.cancellationForm.controls.reason.setValue('x'.repeat(501));
    expect(component.cancellationForm.invalid).toBe(true);
    component.cancellationForm.controls.reason.setValue('Registro duplicado');
    component.closeCancellation();
    component.submitCancellation();
    expect(submit).not.toHaveBeenCalled();
    expect(component.records()).toEqual([record]);
  });

  it('submits the reviewed versions and reason and blocks repeat clicks and escape during cancellation', () => {
    const fixture = setup();
    fixture.componentRef.setInput('records', [record]);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('[aria-labelledby="mortality-cancellation-title"]');
    dialog.showModal = vi.fn(); dialog.close = vi.fn();
    const submit = vi.fn(); component.cancellationSubmitted.subscribe(submit);
    component.openCancellation(record);
    component.cancellationForm.controls.reason.setValue(' Registro duplicado ');
    component.submitCancellation();
    expect(submit).toHaveBeenCalledExactlyOnceWith({ recordId: record.id,
      request: { version: 2, flock_version: 1, reason: 'Registro duplicado' } });
    fixture.componentRef.setInput('cancelling', true); fixture.detectChanges();
    component.submitCancellation(); component.closeCancellation();
    const event = new Event('cancel', { cancelable: true }); component.onCancellationCancel(event);
    expect(event.defaultPrevented).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(dialog.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.undo-button').disabled).toBe(true);
    fixture.componentRef.setInput('cancelling', false);
    fixture.componentRef.setInput('cancelledSequence', 1); fixture.detectChanges();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(component.pendingCancellation()).toBeNull();
  });

  it('requires a fresh review after concurrent changes and never submits a record already cancelled', () => {
    const fixture = setup();
    fixture.componentRef.setInput('records', [record]); fixture.detectChanges();
    const component = fixture.componentInstance;
    fixture.nativeElement.querySelector('[aria-labelledby="mortality-cancellation-title"]').showModal = vi.fn();
    const submit = vi.fn(); component.cancellationSubmitted.subscribe(submit);
    component.openCancellation(record);
    component.cancellationForm.controls.reason.setValue('Error de registro');
    fixture.componentRef.setInput('flock', { ...flock, version: 5 });
    fixture.componentRef.setInput('records', [{ ...record, version: 3, quantity: 4 }]); fixture.detectChanges();
    component.submitCancellation(); fixture.detectChanges();
    expect(submit).not.toHaveBeenCalled();
    expect(component.cancellationDetails()?.quantity).toBe(4);
    expect(component.cancellationReviewError()).toContain('confirmá nuevamente');
    component.submitCancellation();
    expect(submit).toHaveBeenCalledExactlyOnceWith({ recordId: record.id,
      request: { version: 3, flock_version: 5, reason: 'Error de registro' } });
    fixture.componentRef.setInput('records', []); fixture.detectChanges();
    component.submitCancellation();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(component.cancellationReviewError()).toContain('ya no está vigente');
  });

  it('requires explicit reactivation confirmation for a finished flock and resets it if the flock changes', () => {
    const fixture = setup();
    fixture.componentRef.setInput('records', [record]);
    fixture.componentRef.setInput('flock', { ...flock, status: 'finished', current_quantity: 0 }); fixture.detectChanges();
    const component = fixture.componentInstance;
    fixture.nativeElement.querySelector('[aria-labelledby="mortality-cancellation-title"]').showModal = vi.fn();
    const submit = vi.fn(); component.cancellationSubmitted.subscribe(submit);
    component.openCancellation(record); component.cancellationForm.controls.reason.setValue('Registro duplicado');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#mortality-reactivation')).not.toBeNull();
    component.submitCancellation(); expect(submit).not.toHaveBeenCalled();
    component.cancellationForm.controls.reactivate.setValue(true); component.submitCancellation();
    expect(submit.mock.calls[0][0].request.confirm_reactivation).toBe(true);
    fixture.componentRef.setInput('flock', { ...flock, status: 'finished', current_quantity: 0, version: 7 }); fixture.detectChanges();
    component.submitCancellation();
    expect(component.cancellationForm.controls.reactivate.value).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
