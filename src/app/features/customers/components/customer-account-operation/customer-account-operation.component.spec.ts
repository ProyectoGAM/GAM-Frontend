import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { AuthUser } from '../../../../core/auth/auth.types';
import { Customer, CustomerAccountSnapshot, CustomerAdjustmentInput, CustomerPaymentInput } from '../../interfaces/customer';
import { CustomersApi } from '../../services/customers.api';
import { CustomerPendingCommands } from '../../services/customer-pending-commands';
import { CustomerAccountOperationComponent } from './customer-account-operation.component';

const account: CustomerAccountSnapshot = { balance: '1000.125', debt: '1000.125', credit: '0.000', currency: 'UYU', version: 7, as_of: '2026-10-29T20:00:00Z' };
const customer: Customer = { id: 'client', display_name: 'Cliente de prueba', status: 'active', has_location: false, ready_for_delivery: false, created_at: '2026-10-29T20:00:00Z', updated_at: '2026-10-29T20:00:00Z' };

describe('CustomerAccountOperationComponent', () => {
  let fixture: ComponentFixture<CustomerAccountOperationComponent>;
  let component: CustomerAccountOperationComponent;
  const user = signal<AuthUser | null>({ id: 1, name: 'Admin', email: 'test@example.test', deleted_at: null, roles: ['admin'], permissions: [] });
  const api = { pay: vi.fn((_id: string, _body: CustomerPaymentInput, _key: string) => of({ data: [] })), adjust: vi.fn((_id: string, _body: CustomerAdjustmentInput, _key: string) => of({ data: [] })), reverse: vi.fn((_id: string, _movement: string, _reason: string, _key: string) => of({ data: [] })) };

  beforeEach(async () => {
    vi.clearAllMocks();
    user.set({ id: 1, name: 'Admin', email: 'test@example.test', deleted_at: null, roles: ['admin'], permissions: [] });
    api.pay.mockReturnValue(of({ data: [] })); api.adjust.mockReturnValue(of({ data: [] })); api.reverse.mockReturnValue(of({ data: [] }));
    await TestBed.configureTestingModule({ imports: [CustomerAccountOperationComponent], providers: [{ provide: CustomersApi, useValue: api }, { provide: AuthStore, useValue: { user, session: signal(null) } }] }).compileComponents();
    fixture = TestBed.createComponent(CustomerAccountOperationComponent); component = fixture.componentInstance;
    fixture.componentRef.setInput('customer', customer); fixture.componentRef.setInput('account', account); fixture.componentRef.setInput('mode', 'adjustment');
    fixture.detectChanges();
  });

  it('requires a nonempty reason before changing debt', async () => {
    component.form.patchValue({ amount: '150', reason: '  ' });
    await component.submit(); fixture.detectChanges();
    expect(api.adjust).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Indicá el motivo');
  });

  it('previews and submits a precise decrease using the consulted version', async () => {
    component.form.patchValue({ amount: '150,125', direction: 'decrease', reason: 'Corrección acordada' });
    fixture.detectChanges();
    expect(component.after()).toBe('850.000');
    await component.submit();
    expect(api.adjust).toHaveBeenCalledWith('client', { direction: 'decrease', amount: '150.125', reason: 'Corrección acordada', expected_version: 7 }, expect.any(String));
  });

  it('keeps the original key and amount after an uncertain response', async () => {
    api.adjust.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.form.patchValue({ amount: '150.125', reason: 'Revisión' });
    await component.submit();
    const original = api.adjust.mock.calls[0];
    expect(component.pending()).not.toBeNull();
    expect(component.after()).toBeNull();
    component.form.patchValue({ amount: '999' });
    fixture.componentRef.setInput('account', { ...account, version: 9, balance: '2000.000' });
    await component.submit();
    expect(api.adjust.mock.calls[1]).toEqual(original);
    expect(TestBed.inject(CustomerPendingCommands).get('financial:client')).toBeNull();
  });

  it('requests fresh balance and a new confirmation after version conflict', async () => {
    api.adjust.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'La cuenta cambió.' } })));
    const refresh = vi.fn(); component.refreshAccount.subscribe(refresh);
    component.form.patchValue({ amount: '10', reason: 'Acuerdo' });
    await component.submit();
    const previousKey = api.adjust.mock.calls[0][2];
    expect(refresh).toHaveBeenCalledOnce(); expect(component.pending()).toBeNull();
    fixture.componentRef.setInput('account', { ...account, version: 8 });
    await component.submit();
    expect(api.adjust.mock.calls[1][1].expected_version).toBe(8);
    expect(api.adjust.mock.calls[1][2]).not.toBe(previousKey);
  });

  it('accepts an overpayment and presents a credit balance without rounding', async () => {
    fixture.componentRef.setInput('mode', 'payment');
    component.form.patchValue({ amount: '1100.250', payment_method: 'transfer' });
    fixture.detectChanges();
    expect(component.after()).toBe('-100.125');
    await component.submit();
    expect(api.pay).toHaveBeenCalledWith('client', { amount: '1100.250', payment_method: 'transfer', reason: null, payment_reference: null }, expect.any(String));
  });

  it('closes and clears another persons pending operation when identity changes', async () => {
    api.adjust.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.form.patchValue({ amount: '10', reason: 'Revisión' });
    await component.submit();
    const closed = vi.fn(); component.closed.subscribe(closed);
    user.set({ id: 2, name: 'Otra persona', email: 'other@example.test', deleted_at: null, roles: [], permissions: [] });
    fixture.detectChanges();
    expect(closed).toHaveBeenCalled();
    expect(TestBed.inject(CustomerPendingCommands).get('financial:client')).toBeNull();
    await component.submit();
    expect(api.adjust).toHaveBeenCalledTimes(1);
  });
});
