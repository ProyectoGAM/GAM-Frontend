import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { FeedConsumption, FlockFeedingOverview } from '../interfaces/flock-feeding.interface';
import { FlockFeedingService } from './flock-feeding.service';

describe('FlockFeedingService', () => {
  let api: FlockFeedingService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    api = TestBed.inject(FlockFeedingService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const current = { id: 10, modo: 'manual', receta_id: 2, edad_dias: 10,
    cantidad_diaria_g: '20000', etapa: { recipe_id: 1, recipe_snapshot: { name: 'Anterior' } }, finalizado: false };

  it('names the configured recipe and forecasts only the matching configuration copied stages', () => {
    let result: FlockFeedingOverview | undefined;
    api.overview('lot-1', 7).subscribe((value) => { result = value; });
    http.expectOne('/api/v1/lotes/lot-1/alimentacion').flush({ data: current });
    http.expectOne((request) => request.url.endsWith('/alimentacion/historial')).flush({ data: [
      { id: 99, etapas_copiadas: [{ start_day: 11, recipe_id: 99, recipe_snapshot: {} }] },
      { id: 10, etapas_copiadas: [{ start_day: 20, recipe_id: 2, recipe_snapshot: { name: 'Crecimiento' } }] },
    ] });
    http.expectOne((request) => request.url.endsWith('/saldos-alimento') && request.params.get('up_id') === '7')
      .flush({ data: [{ receta_id: 2, up_id: 7, nombre_receta: 'Crecimiento actualizada' }], meta: { last_page: 1 } });
    expect(result?.recipeName).toBe('Crecimiento actualizada');
    expect(result?.nextChange?.day).toBe(20);
    expect(result?.current.modo).toBe('manual');
    expect(result?.scheduleAvailable).toBe(true);
  });

  it('preserves current feeding when history or balances fail and never invents a next date', () => {
    let result: FlockFeedingOverview | undefined;
    api.overview('lot-1', 7).subscribe((value) => { result = value; });
    http.expectOne('/api/v1/lotes/lot-1/alimentacion').flush({ data: current });
    http.expectOne((request) => request.url.endsWith('/alimentacion/historial')).flush({}, { status: 403, statusText: 'Forbidden' });
    http.expectOne((request) => request.url.endsWith('/saldos-alimento')).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(result?.current).toEqual(current);
    expect(result?.recipeName).toBe('Receta #2');
    expect(result?.scheduleAvailable).toBe(false);
    expect(result?.nextChange).toBeNull();
  });

  it('uses a matching copied snapshot when balances are unavailable and distinguishes an exhausted schedule', () => {
    let result: FlockFeedingOverview | undefined;
    api.overview('lot-1', 7).subscribe((value) => { result = value; });
    http.expectOne('/api/v1/lotes/lot-1/alimentacion').flush({ data: current });
    http.expectOne((request) => request.url.endsWith('/alimentacion/historial')).flush({ data: [
      { id: 10, etapas_copiadas: [{ start_day: 1, recipe_id: 2, recipe_snapshot: { name: 'Crecimiento' } }] },
    ] });
    http.expectOne((request) => request.url.endsWith('/saldos-alimento')).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(result?.recipeName).toBe('Crecimiento');
    expect(result?.scheduleAvailable).toBe(true);
    expect(result?.nextChange).toBeNull();
  });

  it('loads all consumption pages before producing a complete history and totals', () => {
    let records: FeedConsumption[] = [];
    api.consumptions('flock/1').subscribe((result) => { records = result; });
    const first = http.expectOne((request) => request.url === '/api/v1/lotes/flock%2F1/consumos-alimento'
      && request.params.get('por_pagina') === '100' && request.params.get('page') === '1');
    first.flush({ data: [{ id: 2 }], meta: { current_page: 1, last_page: 2 } });
    expect(records).toEqual([]);
    http.expectOne((request) => request.params.get('page') === '2').flush({ data: [{ id: 1 }], meta: { current_page: 2, last_page: 2 } });
    expect(records.map((record) => record.id)).toEqual([2, 1]);
  });

  it('keeps an incomplete history unavailable when a remaining page fails', () => {
    let emitted = false; let failed = false;
    api.consumptions('flock-1').subscribe({ next: () => { emitted = true; }, error: () => { failed = true; } });
    http.expectOne((request) => request.params.get('page') === '1').flush({ data: [], meta: { current_page: 1, last_page: 2 } });
    http.expectOne((request) => request.params.get('page') === '2').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(emitted).toBe(false); expect(failed).toBe(true);
  });

  it('queries balances in the requested UP, including every page', () => {
    let count = 0;
    api.balances(8).subscribe((result) => { count = result.length; });
    const first = http.expectOne((request) => request.url === '/api/v1/saldos-alimento' && request.params.get('up_id') === '8');
    first.flush({ data: [{ receta_id: 1 }], meta: { current_page: 1, last_page: 2 } });
    http.expectOne((request) => request.params.get('up_id') === '8' && request.params.get('page') === '2')
      .flush({ data: [{ receta_id: 2 }], meta: { current_page: 2, last_page: 2 } });
    expect(count).toBe(2);
  });

  it('changes the daily configuration and rectifies history with separate idempotent POST operations', () => {
    api.change('lot-1', { cantidad_diaria_g: '12345' }, 'manual-key').subscribe();
    const change = http.expectOne('/api/v1/lotes/lot-1/alimentacion/manual');
    expect(change.request.method).toBe('POST');
    expect(change.request.headers.get('Idempotency-Key')).toBe('manual-key');
    expect(change.request.body).toEqual({ cantidad_diaria_g: '12345' }); change.flush({});
    api.correct('lot-1', 42, { cantidad_g: '0', motivo: 'Error de captura' }, 'correction-key').subscribe();
    const correction = http.expectOne('/api/v1/lotes/lot-1/consumos-alimento/42/rectificaciones');
    expect(correction.request.method).toBe('POST');
    expect(correction.request.headers.get('Idempotency-Key')).toBe('correction-key');
    expect(correction.request.body).toEqual({ cantidad_g: '0', motivo: 'Error de captura' }); correction.flush({});
  });

  it('restores automatic feeding with an empty body and its own idempotency key', () => {
    api.automatic('lot/1', 'automatic-key').subscribe();
    const request = http.expectOne('/api/v1/lotes/lot%2F1/alimentacion/automatico');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({});
    expect(request.request.headers.get('Idempotency-Key')).toBe('automatic-key'); request.flush({});
  });
});
