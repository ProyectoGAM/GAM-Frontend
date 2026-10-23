import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedAdjustmentResult, PendingFeedAdjustment } from '../../interfaces/feed-adjustment.interface';
import { FeedAdjustmentService } from '../../services/feed-adjustment.service';
import { FeedStockAdjustmentComponent } from './feed-stock-adjustment.component';

describe('FeedStockAdjustmentComponent', () => {
  let fixture: ComponentFixture<FeedStockAdjustmentComponent>;
  let component: FeedStockAdjustmentComponent;
  let service: { adjust: ReturnType<typeof vi.fn>; readPending: ReturnType<typeof vi.fn>;
    rememberPending: ReturnType<typeof vi.fn>; forgetPending: ReturnType<typeof vi.fn> };
  const user = signal<{ id: number } | null>({ id: 1 });
  const result: FeedAdjustmentResult = { id: 4, planta_id: 12, producto_id: 2, saldo_anterior_g: '120000', saldo_resultante_g: '145000' };

  beforeEach(() => {
    user.set({ id: 1 });
    service = { adjust: vi.fn().mockReturnValue(of(result)), readPending: vi.fn().mockReturnValue(null),
      rememberPending: vi.fn(), forgetPending: vi.fn() };
    TestBed.configureTestingModule({ imports: [FeedStockAdjustmentComponent], providers: [
      { provide: FeedAdjustmentService, useValue: service },
      { provide: AuthStore, useValue: { user, session: signal({ id: 'a' }) } },
    ] });
  });

  const render = (): void => {
    fixture = TestBed.createComponent(FeedStockAdjustmentComponent); component = fixture.componentInstance;
    fixture.componentRef.setInput('plantId', 12);
    fixture.componentRef.setInput('operational', true);
    fixture.componentRef.setInput('ingredients', [
      { id: 2, name: 'Maíz en grano', sku: 'MAIZ', stockGrams: '120000' },
      { id: 3, name: 'Soja', sku: 'SOJA', stockGrams: '150000.123456' },
    ]);
    fixture.detectChanges();
  };
  const fill = (): void => component.form.setValue({ productId: '2', quantity: '25', action: 'sumar', reason: 'Recuento físico' });

  it('previews all operations for only the plant ingredients without submitting', () => {
    render(); fill(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('#adjustment-ingredient option')).toHaveLength(3);
    const action = fixture.nativeElement.querySelector('#adjustment-action') as HTMLSelectElement;
    expect([...action.options].map((option) => option.text)).toEqual(['Sumar', 'Restar', 'Fijar stock']);
    expect(fixture.nativeElement.querySelector('.preview')?.textContent).toContain('145 kg');
    action.value = 'restar'; action.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.preview')?.textContent).toContain('95 kg');
    action.value = 'establecer'; action.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.preview')?.textContent).toContain('25 kg');
    component.form.controls.productId.setValue('3'); component.form.controls.action.setValue('sumar'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.preview')?.textContent).toContain('175,000123456 kg');
    expect(service.adjust).not.toHaveBeenCalled();
  });

  it('requires a stocked material, valid quantity and reason and refuses negative results', () => {
    render(); component.submit(); expect(service.adjust).not.toHaveBeenCalled();
    fill(); component.form.controls.reason.setValue(' '); component.submit();
    fill(); component.form.controls.productId.setValue('999'); component.submit();
    fill(); component.form.controls.quantity.setValue('1.0001'); component.submit();
    fill(); component.form.patchValue({ action: 'restar', quantity: '121' }); component.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('El resultado debe ser mayor o igual a cero');
    expect(service.adjust).not.toHaveBeenCalled();
  });

  it('sends exact grams and reason, blocks duplicate submits and close, then emits the real result', () => {
    const response = new Subject<FeedAdjustmentResult>(); service.adjust.mockReturnValue(response);
    render(); fill(); component.form.patchValue({ quantity: '0,001', reason: ' Recuento físico ' });
    const saved = vi.fn(); const closed = vi.fn(); component.saved.subscribe(saved); component.closed.subscribe(closed);
    component.submit(); component.submit(); component.close(); fixture.detectChanges();
    expect(service.adjust).toHaveBeenCalledOnce();
    expect(service.adjust).toHaveBeenCalledWith(12, expect.objectContaining({ productId: 2,
      request: { accion: 'sumar', valor_g: '1', motivo: 'Recuento físico' } }));
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    expect(closed).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
    response.next(result); fixture.detectChanges();
    expect(saved).toHaveBeenCalledWith(result); expect(component.busy()).toBe(false);
    expect(service.forgetPending).toHaveBeenCalledWith('1:a', 12);
  });

  it('accepts zero when fixing stock and prevents new adjustments on a non-operational plant', () => {
    render(); fill(); component.form.patchValue({ action: 'establecer', quantity: '0' }); component.submit();
    expect(service.adjust.mock.calls[0][1].request.valor_g).toBe('0');
    service.adjust.mockClear(); fixture.componentRef.setInput('operational', false); fixture.detectChanges();
    component.submit(); expect(service.adjust).not.toHaveBeenCalled();
  });

  it('retries an uncertain request with its original body and key, even after form values change', () => {
    service.adjust.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    render(); fill(); component.submit(); fixture.detectChanges();
    const pending = service.adjust.mock.calls[0][1];
    expect(component.pending()).toEqual(pending);
    expect(fixture.nativeElement.textContent).toContain('Reintentar ajuste');
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    component.form.patchValue({ quantity: '999', action: 'restar', reason: 'Changed' }); component.submit();
    expect(service.adjust.mock.calls[1]).toEqual([12, pending]);
  });

  it('restores and retries pending requests even if the ingredient or plant is no longer selectable', () => {
    const pending: PendingFeedAdjustment = { productId: 99, key: 'key', request: { accion: 'establecer', valor_g: '0', motivo: 'Recuento' } };
    service.readPending.mockReturnValue(pending); render();
    fixture.componentRef.setInput('operational', false); fixture.detectChanges();
    expect(component.form.controls.quantity.value).toBe('0.000');
    component.submit(); expect(service.adjust).toHaveBeenCalledWith(12, pending);
  });

  it('allows correction and requests fresh stock after a definitive conflict', () => {
    service.adjust.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    render(); fill(); const refresh = vi.fn(); component.refreshStock.subscribe(refresh);
    component.submit(); fixture.detectChanges();
    expect(component.pending()).toBeNull(); expect(refresh).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Revisá los datos actualizados');
  });

  it('discards the active pending operation on identity changes and ignores a late response', () => {
    const response = new Subject<FeedAdjustmentResult>(); service.adjust.mockReturnValue(response);
    render(); fill(); const saved = vi.fn(); const closed = vi.fn();
    component.saved.subscribe(saved); component.closed.subscribe(closed); component.submit();
    user.set({ id: 2 }); fixture.detectChanges(); response.next(result);
    expect(saved).not.toHaveBeenCalled(); expect(closed).toHaveBeenCalled();
    expect(service.forgetPending).toHaveBeenCalledWith('1:a', 12);
  });
});
