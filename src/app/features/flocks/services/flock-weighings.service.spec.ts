import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { FlockWeighingsService } from './flock-weighings.service';

describe('FlockWeighingsService', () => {
  let service: FlockWeighingsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
    ] });
    service = TestBed.inject(FlockWeighingsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads every daily evolution page in the requested period without fetching individual entries', () => {
    let dates: string[] = [];
    service.dailyEvolution('flock-1', '2026-10-03', '2026-10-09').subscribe((days) => { dates = days.map((day) => day.date); });
    const first = http.expectOne((request) => request.url === '/api/v1/pesajes-diarios'
      && request.params.get('flock_id') === 'flock-1' && request.params.get('date_from') === '2026-10-03'
      && request.params.get('date_to') === '2026-10-09' && request.params.get('per_page') === '100'
      && !request.params.has('cursor'));
    first.flush({ data: [{ date: '2026-10-09' }], next_cursor: 'older' });
    expect(dates).toEqual([]);
    const second = http.expectOne((request) => request.params.get('cursor') === 'older'
      && request.params.get('date_from') === '2026-10-03' && request.params.get('date_to') === '2026-10-09');
    second.flush({ data: [{ date: '2026-10-08' }], next_cursor: null });
    expect(dates).toEqual(['2026-10-09', '2026-10-08']);
  });

  it('does not restrict the starting date for the full evolution history and preserves permission failures', () => {
    let forbidden = false;
    service.dailyEvolution('flock-1', null, '2026-10-09').subscribe({ error: () => { forbidden = true; } });
    const request = http.expectOne((candidate) => candidate.url === '/api/v1/pesajes-diarios'
      && !candidate.params.has('date_from'));
    request.flush({}, { status: 403, statusText: 'Forbidden' });
    expect(forbidden).toBe(true);
  });

  it('uses the daily history cursor', () => {
    service.listDaily('flock-1', 'cursor-2').subscribe();
    const list = http.expectOne((request) => request.url === '/api/v1/pesajes-diarios'
      && request.params.get('flock_id') === 'flock-1'
      && request.params.get('cursor') === 'cursor-2'
      && request.params.get('per_page') === '20');
    list.flush({ data: [], next_cursor: null });

  });

  it('uses the same idempotency key for outlier confirmation and sends delete reason and version', () => {
    const key = '00000000-0000-4000-8000-000000000001';
    service.addDailyEntry('flock-1', { mode: 'group', bird_count: 3, total_weight: '90.0' }, key).subscribe();
    const add = http.expectOne('/api/v1/lotes/flock-1/pesajes-diarios/ingresos');
    expect(add.request.method).toBe('POST');
    expect(add.request.headers.get('Idempotency-Key')).toBe(key);
    expect(add.request.body).toEqual({ mode: 'group', bird_count: 3, total_weight: '90.0' });
    add.flush({ data: { operation_id: key, daily_weighing: { id: 'day-1' } } });

    service.addDailyEntry('flock-1', { mode: 'group', bird_count: 3, total_weight: '90.0', confirm_out_of_range: true }, key).subscribe();
    const confirmed = http.expectOne('/api/v1/lotes/flock-1/pesajes-diarios/ingresos');
    expect(confirmed.request.headers.get('Idempotency-Key')).toBe(key);
    expect(confirmed.request.body.confirm_out_of_range).toBe(true);
    confirmed.flush({ data: { operation_id: key, daily_weighing: { id: 'day-1' } } });

    service.deleteDailyEntry('day-1', 'entry-1', { version: 2, reason: 'Error de captura' }, key).subscribe();
    const deleted = http.expectOne('/api/v1/pesajes-diarios/day-1/ingresos/entry-1');
    expect(deleted.request.method).toBe('DELETE');
    expect(deleted.request.headers.get('Idempotency-Key')).toBe(key);
    expect(deleted.request.body).toEqual({ version: 2, reason: 'Error de captura' });
    deleted.flush({ data: { operation_id: key, daily_weighing: { id: 'day-1' }, deleted_entry_id: 'entry-1' } });
  });

  it('reads and updates global settings with an idempotency key', () => {
    let version: number | undefined;
    service.settings().subscribe((settings) => (version = settings?.version));
    http.expectOne('/api/v1/configuracion-pesajes').flush({ data: {
      version: 3, adult_from_week: 10, chick_min_weight_g: '50', chick_max_weight_g: '90',
      adult_min_weight_g: '900', adult_max_weight_g: '1400',
    } });
    expect(version).toBe(3);

    service.saveSettings({
      version: 3, adult_from_week: 10, unit: 'g',
      chick_min_weight: '50', chick_max_weight: '90', adult_min_weight: '900', adult_max_weight: '1400',
    }, '00000000-0000-4000-8000-000000000001').subscribe();
    const save = http.expectOne('/api/v1/configuracion-pesajes');
    expect(save.request.method).toBe('PUT');
    expect(save.request.headers.get('Idempotency-Key')).toBe('00000000-0000-4000-8000-000000000001');
    expect(save.request.body).toMatchObject({ version: 3, adult_from_week: 10, unit: 'g' });
    save.flush({ data: { operation_id: 'operation-1' } });
  });

  it('finds the associated breed across catalog pages, including inactive breeds', () => {
    let name: string | undefined;
    service.breedSettings(7).subscribe((breed) => { name = breed.name; });
    const first = http.expectOne((request) => request.url === '/api/v1/breeds'
      && request.params.get('page') === '1' && !request.params.has('status'));
    first.flush({ data: [{ id: 2 }], meta: { last_page: 2 } });
    const second = http.expectOne((request) => request.url === '/api/v1/breeds' && request.params.get('page') === '2');
    second.flush({ data: [{ id: 7, name: 'Hy-Line Brown', status: 'inactive' }], meta: { last_page: 2 } });
    expect(name).toBe('Hy-Line Brown');
  });

  it('reports a missing breed and saves breed ranges without updating global settings', () => {
    let missing = false;
    service.breedSettings(7).subscribe({ error: () => { missing = true; } });
    http.expectOne((request) => request.url === '/api/v1/breeds').flush({ data: [], meta: { last_page: 1 } });
    expect(missing).toBe(true);
    const payload = { version: 4, chick_min_weight_g: null, chick_max_weight_g: null,
      adult_min_weight_g: '1500', adult_max_weight_g: '2200' };
    service.saveBreedSettings(7, payload, 'key').subscribe();
    const save = http.expectOne('/api/v1/breeds/7');
    expect(save.request.method).toBe('PATCH');
    expect(save.request.headers.get('Idempotency-Key')).toBe('key');
    expect(save.request.body).toEqual(payload);
    save.flush({ data: { operation_id: 'operation-1' } });
  });
});
