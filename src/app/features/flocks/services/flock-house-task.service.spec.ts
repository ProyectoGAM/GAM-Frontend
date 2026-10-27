import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { FlockHouseTaskRequest } from '../interfaces/flock-house-task.interface';
import { MortalitySubmission } from '../interfaces/flock-mortality.interface';
import { Flock } from '../interfaces/flock.interface';
import { FlockDetailService, todayInLotsTimezone } from './flock-detail.service';
import { FlockFeedingService } from './flock-feeding.service';
import { FlockHouseTaskService } from './flock-house-task.service';
import { FlockMortalitiesService } from './flock-mortalities.service';

const flock = { id: 'lot-1', code: 'LOTE', status: 'active', production_unit_id: 7, poultry_house_id: 22,
  version: 1, current_quantity: 100, entry_date: '2026-01-01', established_at: '2026-01-01T12:00:00Z' } as Flock;
const request: FlockHouseTaskRequest = { kind: 'mortality', flockId: flock.id, origin: { unitId: 7, houseId: 22 },
  trigger: null, houseName: 'Galpón 22', unitName: 'UP 7' };
const draft: MortalitySubmission = { draft: { date: todayInLotsTimezone(), quantity: 1, reason: 'Lesión' }, excessConfirmation: null };

describe('FlockHouseTaskService', () => {
  const getFlock = vi.fn(); const record = vi.fn(); const current = vi.fn(); const balances = vi.fn();
  const change = vi.fn(); const automatic = vi.fn();
  let task: FlockHouseTaskService;
  beforeEach(() => {
    vi.resetAllMocks();
    getFlock.mockReturnValue(of(flock)); record.mockReturnValue(of({}));
    current.mockReturnValue(of({ modo: 'manual', receta_id: 1, cantidad_diaria_g: '1000', finalizado: false,
      etapa: { recipe_id: 1, recipe_snapshot: { name: 'Ración actual' } } }));
    balances.mockReturnValue(of([
      { up_id: 7, receta_id: 1, nombre_receta: 'Disponible', estado_receta: 'active', saldo_g: '1000' },
      { up_id: 7, receta_id: 2, nombre_receta: 'Inactiva', estado_receta: 'inactive', saldo_g: '1000' },
      { up_id: 7, receta_id: 3, nombre_receta: 'Sin saldo', estado_receta: 'active', saldo_g: '0' },
      { up_id: 8, receta_id: 4, nombre_receta: 'Otra UP', estado_receta: 'active', saldo_g: '1000' },
    ]));
    change.mockReturnValue(of({})); automatic.mockReturnValue(of({}));
    TestBed.configureTestingModule({ providers: [FlockHouseTaskService,
      { provide: AuthStore, useValue: { user: signal({ id: 1 }) } },
      { provide: FlockDetailService, useValue: { flock: getFlock } },
      { provide: FlockMortalitiesService, useValue: { record } },
      { provide: FlockFeedingService, useValue: { current, balances, change, automatic } },
    ] });
    task = TestBed.inject(FlockHouseTaskService);
  });

  it.each([{ ...flock, poultry_house_id: 23 }, { ...flock, production_unit_id: 8 }, { ...flock, status: 'finished' }])
  ('blocks moved or finished lots before opening an editor', (other) => {
    getFlock.mockReturnValue(of(other)); task.start({ ...request, kind: 'feeding' });
    expect(task.state()).toBe('error'); expect(current).not.toHaveBeenCalled();
    task.saveMortality(draft); expect(record).not.toHaveBeenCalled();
  });

  it('records once, locks duplicate submissions and reports success without requesting history', () => {
    const response = new Subject<unknown>(); record.mockReturnValue(response);
    task.start(request); task.saveMortality(draft); task.saveMortality(draft);
    expect(task.saving()).toBe(true); expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0][1]).toMatchObject({ version: 1, quantity: 1, notes: 'Lesión' });
    response.next({}); expect(task.saving()).toBe(false); expect(task.result()).toBe('Mortalidad registrada.');
    task.saveMortality(draft); expect(record).toHaveBeenCalledOnce(); expect(current).not.toHaveBeenCalled();
  });

  it('retains the exact mortality request and idempotency key across network retries', () => {
    record.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    task.start(request); task.saveMortality(draft); task.saveMortality(draft);
    expect(record.mock.calls[1]).toEqual(record.mock.calls[0]); expect(task.result()).toBeNull();
    expect(task.saveError()).toContain('Sin conexión');
  });

  it('requires a fresh excess confirmation after a concurrent flock update', () => {
    task.start(request);
    task.saveMortality({ ...draft, draft: { ...draft.draft, quantity: 101 } }); expect(record).not.toHaveBeenCalled();
    record.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    getFlock.mockReturnValue(of({ ...flock, version: 2, current_quantity: 90 }));
    const over = { draft: { ...draft.draft, quantity: 101 }, excessConfirmation: { version: 1, balance: 100 } };
    task.saveMortality(over); expect(task.flock()?.version).toBe(2);
    task.saveMortality(over); expect(record).toHaveBeenCalledOnce(); expect(task.saveError()).toContain('Confirmá');
  });

  it('maps validation errors to mortality fields while keeping the form available', () => {
    record.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422,
      error: { errors: { quantity: ['Cantidad inválida'], notes: ['Motivo inválido'] } } })));
    task.start(request); task.saveMortality(draft);
    expect(task.fieldErrors()).toEqual({ quantity: 'Cantidad inválida', reason: 'Motivo inválido' });
    expect(task.state()).toBe('ready'); expect(task.saving()).toBe(false);
  });

  it('refuses another mutation when conflict recovery fails or the lot moved', () => {
    task.start(request);
    record.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    getFlock.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    task.saveMortality(draft); task.saveMortality(draft);
    expect(task.state()).toBe('error'); expect(record).toHaveBeenCalledOnce();
  });

  it('offers only active recipes with positive stock in the current UP and submits exact grams', () => {
    task.start({ ...request, kind: 'feeding' });
    expect(task.options().map((option) => option.id)).toEqual([1]);
    task.saveFeeding({ mode: 'manual', recipeId: 4, grams: '1250', reason: '' }); expect(change).not.toHaveBeenCalled();
    task.saveFeeding({ mode: 'manual', recipeId: 1, grams: '1250', reason: '' });
    expect(change).toHaveBeenCalledWith(flock.id, { receta_id: 1, cantidad_diaria_g: '1250' }, expect.any(String));
    expect(task.result()).toBe('Alimentación actualizada.');
  });

  it('permits changing only quantity after a recipe lookup failure and retries feeding idempotently', () => {
    balances.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    change.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    task.start({ ...request, kind: 'feeding' });
    const submission = { mode: 'manual' as const, recipeId: null, grams: '1001', reason: '' };
    task.saveFeeding(submission); task.saveFeeding(submission);
    expect(change.mock.calls[0][1]).toEqual({ cantidad_diaria_g: '1001' });
    expect(change.mock.calls[1]).toEqual(change.mock.calls[0]);
  });

  it('applies automatic mode through its existing endpoint', () => {
    task.start({ ...request, kind: 'feeding' });
    task.saveFeeding({ mode: 'automatico', recipeId: null, grams: null, reason: '' });
    expect(automatic).toHaveBeenCalledWith(flock.id, expect.any(String)); expect(change).not.toHaveBeenCalled();
  });

  it('does not open feeding when its configuration cannot be loaded', () => {
    current.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    task.start({ ...request, kind: 'feeding' });
    expect(task.state()).toBe('error'); expect(balances).not.toHaveBeenCalled();
  });

  it('ignores a superseded load and cancels pending subscriptions on destruction', () => {
    const pending = new Subject<Flock>(); getFlock.mockReturnValueOnce(pending);
    task.start(request); task.load(); pending.next({ ...flock, code: 'Stale' });
    expect(task.flock()?.code).toBe('LOTE');
    const save = new Subject<unknown>(); record.mockReturnValue(save); task.saveMortality(draft);
    TestBed.resetTestingModule(); expect(save.observed).toBe(false);
  });
});
