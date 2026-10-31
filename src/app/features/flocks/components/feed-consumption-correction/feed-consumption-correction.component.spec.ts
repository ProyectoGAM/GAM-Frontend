import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedConsumption } from '../../interfaces/flock-feeding.interface';
import { FlockFeedingService } from '../../services/flock-feeding.service';
import { FeedConsumptionCorrectionComponent } from './feed-consumption-correction.component';

const record: FeedConsumption = { id: 196, fecha: '2026-10-30', up_id: 9, modo: 'automatico', receta_id: 3,
  cantidad_g: '36001', original: { receta_id: 3, cantidad_g: '36000' }, etapa: { recipe_id: 3, recipe_snapshot: { name: 'Ración histórica' } } };
describe('Feed consumption correction from audit', () => {
  const api = { consumptions: vi.fn(), balances: vi.fn(), correct: vi.fn() };
  const session = signal({ id: 'session-1' });
  const auth = { user: () => ({ id: 1 }), session, status: () => 'personal_authenticated' };
  let component: FeedConsumptionCorrectionComponent;
  beforeEach(() => {
    vi.resetAllMocks(); session.set({ id: 'session-1' });
    api.consumptions.mockReturnValue(of([record]));
    api.balances.mockReturnValue(of([{ receta_id: 3, nombre_receta: 'Ración inactiva', estado_receta: 'inactive', up_id: 9, saldo_g: '1' }]));
    api.correct.mockReturnValue(of({}));
    TestBed.configureTestingModule({ imports: [FeedConsumptionCorrectionComponent], providers: [
      { provide: FlockFeedingService, useValue: api }, { provide: AuthStore, useValue: auth },
    ] }).overrideComponent(FeedConsumptionCorrectionComponent, { set: { template: '', imports: [] } });
    component = TestBed.createComponent(FeedConsumptionCorrectionComponent).componentInstance;
  });
  it('loads the current consumption and its own UP without editing presentation strings or imposing an active recipe rule', async () => {
    await component.open('lot-public', 196, null);
    expect(api.consumptions).toHaveBeenCalledWith('lot-public');
    expect(api.balances).toHaveBeenCalledWith(9);
    expect(component.record()?.cantidad_g).toBe('36001');
    expect(component.recipes()[0].inactive).toBe(true);
    expect(api.correct).not.toHaveBeenCalled();
    await component.save({ recipeId: 3, grams: '0', reason: 'Corrección a cero' });
    expect(api.correct).toHaveBeenCalledWith('lot-public', 196, { receta_id: 3, cantidad_g: '0', motivo: 'Corrección a cero' }, expect.any(String));
  });
  it('retains the same UUID for an identical network retry, and creates a new one for a different payload', async () => {
    api.correct.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await component.open('lot-public', 196, null);
    const payload = { recipeId: null, grams: '36001', reason: 'Corregir cantidad' };
    await component.save(payload); await component.save(payload);
    expect(api.correct.mock.calls[1]).toEqual(api.correct.mock.calls[0]);
    await component.save({ ...payload, grams: '36002' });
    expect(api.correct.mock.calls[2][3]).not.toBe(api.correct.mock.calls[0][3]);
  });
  it('reports a conflict and blocks further confirmation until the operation is reopened', async () => {
    api.correct.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'Existe una rectificación posterior.' } })));
    const failed = vi.fn(); component.failed.subscribe(failed);
    await component.open('lot-public', 196, null);
    await component.save({ recipeId: null, grams: '0', reason: 'Corregir' });
    expect(component.error()).toContain('rectificación posterior'); expect(failed).toHaveBeenCalledWith(409);
    await component.save({ recipeId: null, grams: '1', reason: 'Corregir' });
    expect(api.correct).toHaveBeenCalledOnce();
  });
  it('prevents submissions after a same-user session change and discards an invalidated request', async () => {
    await component.open('lot-public', 196, null); session.set({ id: 'session-2' });
    await component.save({ recipeId: null, grams: '0', reason: 'Corregir' });
    expect(api.correct).not.toHaveBeenCalled();
    const pending = new Subject<FeedConsumption[]>(); api.consumptions.mockReturnValue(pending);
    component.invalidate(); const opening = component.open('other-lot', 196, null);
    component.invalidate(); pending.next([record]); pending.complete(); await opening;
    expect(component.isOpen()).toBe(false); expect(component.record()).toBeNull();
  });
  it('allows quantity-only correction when recipe balances cannot be queried and preserves integer precision', async () => {
    api.balances.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await component.open('closed-lot', 196, null);
    expect(component.balanceState()).toBe('error');
    await component.save({ recipeId: null, grams: '999999999999', reason: 'Rectificación' });
    expect(api.correct).toHaveBeenCalledWith('closed-lot', 196, { cantidad_g: '999999999999', motivo: 'Rectificación' }, expect.any(String));
  });
});
