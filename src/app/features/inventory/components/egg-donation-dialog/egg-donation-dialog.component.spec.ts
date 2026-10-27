import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { EggStockApi } from '../../services/egg-stock.api';
import { EggDonationDialogComponent } from './egg-donation-dialog.component';

const unit = { id: 2, name: 'Granja El Ombú' };
const past = '2026-01-10T10:30';

describe('EggDonationDialogComponent', () => {
  let fixture: ComponentFixture<EggDonationDialogComponent>;
  let restore: () => void;
  let trigger: HTMLButtonElement;
  const donate = vi.fn();
  const user = signal({ id: 1, permissions: ['egg-stock.move'] });

  beforeEach(() => {
    restore = stubNativeDialog(); vi.resetAllMocks();
    user.set({ id: 1, permissions: ['egg-stock.move'] });
    donate.mockReturnValue(of({ data: { transaction: 'donation-one' } }));
    TestBed.configureTestingModule({ imports: [EggDonationDialogComponent], providers: [
      { provide: AuthStore, useValue: { isAdmin: () => false, user } },
      { provide: EggStockApi, useValue: { donate } },
    ] });
    fixture = TestBed.createComponent(EggDonationDialogComponent); fixture.detectChanges();
    trigger = document.createElement('button'); document.body.appendChild(trigger);
  });
  afterEach(() => { fixture.destroy(); trigger.remove(); restore(); });
  const component = () => fixture.componentInstance;
  const modal = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  function open(balance: number | null = 9503) { component().open(unit, balance, trigger); fixture.detectChanges(); }
  function fill(quantity = '120') { component().form.setValue({ quantity, occurred_at: past, reason: '  Comedor barrial  ', notes: 'Entrega de la mañana' }); fixture.detectChanges(); }

  it('opens a closed modal with the source, real balance, local current date and focused quantity', () => {
    expect(modal().open).toBe(false); open();
    expect(modal().open).toBe(true); expect(document.activeElement?.id).toBe('donation-quantity');
    expect(modal().textContent).toContain('Granja El Ombú'); expect(modal().textContent).toContain('9.503 huevos');
    expect(component().form.controls.occurred_at.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(component().form.controls.occurred_at.valid).toBe(true);
  });

  it('cancels with Escape and restores focus, retaining a draft only for the same unit', async () => {
    open(); fill(); modal().dispatchEvent(new Event('cancel', { cancelable: true }));
    await fixture.whenStable(); fixture.detectChanges();
    expect(modal().open).toBe(false); expect(document.activeElement).toBe(trigger); expect(donate).not.toHaveBeenCalled();
    open(); expect(component().form.controls.quantity.value).toBe('120');
    component().close(); component().open({ id: 3, name: 'Otra UP' }, 20, trigger);
    expect(component().form.controls.quantity.value).toBe('');
    expect(component().form.controls.reason.value).toBe('');
  });

  it('shows the exact impact and a warning for negative stock without inventing a backend restriction', async () => {
    open(100); fill('120');
    expect(component().result()).toBe(-20); expect(modal().querySelector('.negative')?.textContent).toContain('negativo');
    expect(modal().textContent).toContain('Saldo resultante: -20 huevos');
    await component().save(); expect(donate).toHaveBeenCalledWith(2, expect.objectContaining({ quantity: 120 }), expect.any(String));
  });

  it('does not fabricate a remaining balance when read access or the stock lookup is unavailable', () => {
    open(null); fill();
    expect(component().result()).toBeNull(); expect(component().resultLabel()).toBeNull();
    expect(modal().textContent).toContain('No disponible');
    expect(modal().textContent).toContain('Se descontarán 120 huevos');
    expect(modal().textContent).not.toContain('Saldo resultante:');
  });

  it('rejects zero, fractional, negative and out-of-range quantities and nonblank required fields', async () => {
    open();
    for (const quantity of ['', '0', '-1', '1.5', '1,5', '2147483648']) {
      fill(quantity); await component().save(); expect(component().form.controls.quantity.invalid).toBe(true);
    }
    fill(); component().form.controls.reason.setValue('   '); await component().save();
    expect(component().form.controls.reason.invalid).toBe(true);
    component().form.controls.reason.setValue('x'.repeat(501)); await component().save();
    expect(component().form.controls.reason.invalid).toBe(true);
    fill(); component().form.controls.notes.setValue('x'.repeat(5001)); await component().save();
    expect(donate).not.toHaveBeenCalled();
    await fixture.whenStable(); fixture.detectChanges();
    expect(modal().querySelector('[aria-invalid="true"]')).not.toBeNull();
  });

  it('rejects invalid and future dates before attempting a command', async () => {
    open(); fill();
    for (const date of ['', 'invalid', '2099-01-01T12:00']) {
      component().form.controls.occurred_at.setValue(date); await component().save();
      expect(component().form.controls.occurred_at.invalid).toBe(true);
    }
    expect(donate).not.toHaveBeenCalled();
  });

  it('posts integer eggs, ISO time and the existing reason/notes contract, then resets after success', async () => {
    open(); fill('2147483647'); const saved = vi.fn(); component().saved.subscribe(saved);
    await component().save(); fixture.detectChanges();
    expect(donate).toHaveBeenCalledWith(2, {
      quantity: 2147483647, occurred_at: new Date(past).toISOString(), reason: 'Comedor barrial', notes: 'Entrega de la mañana',
    }, expect.any(String));
    expect(saved).toHaveBeenCalledExactlyOnceWith(2); expect(modal().open).toBe(false);
    expect(component().form.controls.quantity.value).toBe('');
    await component().save(); expect(donate).toHaveBeenCalledTimes(1);
  });

  it('locks fields, closing and double submission until the request completes', async () => {
    const pending = new Subject<{ data: { transaction: string } }>(); donate.mockReturnValue(pending);
    open(); fill(); const saving = component().save(); fixture.detectChanges();
    component().close(); const cancel = new Event('cancel', { cancelable: true }); modal().dispatchEvent(cancel);
    await component().save();
    expect(cancel.defaultPrevented).toBe(true); expect(modal().open).toBe(true); expect(donate).toHaveBeenCalledTimes(1);
    expect(modal().querySelector('fieldset')?.disabled).toBe(true);
    expect([...modal().querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    pending.next({ data: { transaction: 'saved' } }); await saving;
    expect(modal().open).toBe(false); expect(component().busy()).toBe(false);
  });

  it('keeps uncertain retries idempotent across cancel/reopen and changes the key for edited content', async () => {
    donate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    open(); fill(); await component().save();
    expect(component().error()).toContain('conectar');
    component().close(); open(9400); await component().save();
    expect(donate.mock.calls[1]).toEqual(donate.mock.calls[0]);
    component().form.controls.notes.setValue('Otra entrega'); await component().save();
    expect(donate.mock.calls[2][2]).not.toBe(donate.mock.calls[0][2]);
  });

  it('shows server validation inside the modal and focuses the affected field while preserving values', async () => {
    donate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { reason: ['Revisa el destinatario.'] } } })));
    open(); fill(); await component().save(); await fixture.whenStable(); fixture.detectChanges();
    expect(modal().open).toBe(true); expect(modal().textContent).toContain('Revisa el destinatario.');
    expect(component().form.controls.quantity.value).toBe('120');
    expect(document.activeElement?.id).toBe('donation-reason');
  });

  it('blocks commands without move permission and discards late results when the actor changes', async () => {
    const pending = new Subject<{ data: { transaction: string } }>(); donate.mockReturnValue(pending);
    const saved = vi.fn(); component().saved.subscribe(saved);
    open(); fill(); const saving = component().save();
    user.set({ id: 2, permissions: [] }); fixture.detectChanges(); await fixture.whenStable();
    expect(modal().open).toBe(false); expect(component().unit()).toBeNull();
    expect(component().balance()).toBeNull();
    pending.next({ data: { transaction: 'old-actor' } }); await saving;
    expect(saved).not.toHaveBeenCalled(); expect(component().form.controls.reason.value).toBe('');
    open(); await component().save(); expect(modal().open).toBe(false); expect(donate).toHaveBeenCalledTimes(1);
  });

  it('ignores a command result delivered after the component is destroyed', async () => {
    const pending = new Subject<{ data: { transaction: string } }>(); donate.mockReturnValue(pending);
    const saved = vi.fn(); component().saved.subscribe(saved); open(); fill(); const saving = component().save();
    fixture.destroy(); pending.next({ data: { transaction: 'late' } }); await saving;
    expect(saved).not.toHaveBeenCalled();
  });
});
