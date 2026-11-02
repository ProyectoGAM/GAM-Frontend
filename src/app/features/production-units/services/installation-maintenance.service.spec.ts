import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { maintenanceRecord } from '../testing/maintenance-fixtures';
import { InstallationMaintenanceService } from './installation-maintenance.service';

describe('InstallationMaintenanceService', () => {
  let api: InstallationMaintenanceService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    api = TestBed.inject(InstallationMaintenanceService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('queries the selected installation with status, dates and pagination', () => {
    api.list(22, { status: 'cancelled', date_from: '2026-01-01', date_to: '2026-02-01' }, 2).subscribe();
    const request = http.expectOne((request) => request.url === '/api/v1/poultry-houses/22/maintenances');
    expect(request.request.params.get('status')).toBe('cancelled');
    expect(request.request.params.get('date_from')).toBe('2026-01-01');
    expect(request.request.params.get('date_to')).toBe('2026-02-01');
    expect(request.request.params.get('page')).toBe('2'); expect(request.request.params.get('per_page')).toBe('20'); request.flush({ data: [], meta: {} });
  });

  it('registers zero cost with an idempotency header and no installation-status mutation', () => {
    const input = { maintenance_date: '2026-01-01', description: 'Limpieza', cost_amount: '0.00', cost_currency: 'UYU' as const, responsible_user_id: 1 };
    api.create(22, input, 'attempt-key').subscribe((record) => expect(record).toEqual(maintenanceRecord));
    const request = http.expectOne('/api/v1/poultry-houses/22/maintenances');
    expect(request.request.method).toBe('POST'); expect(request.request.headers.get('Idempotency-Key')).toBe('attempt-key');
    expect(request.request.body).toEqual(input); request.flush({ data: maintenanceRecord });
  });

  it('totals every completed-history page exactly, excluding cancellations and separating currencies', () => {
    const totals: unknown[] = [];
    api.totalCost(22).subscribe((result) => totals.push(result));
    const first = http.expectOne((request) => request.url === '/api/v1/poultry-houses/22/maintenances');
    expect(first.request.params.get('status')).toBe('completed');
    expect(first.request.params.get('per_page')).toBe('100');
    expect(first.request.params.has('date_from')).toBe(false);
    first.flush({ data: [
      { ...maintenanceRecord, cost: { amount: '999999999999999.10', currency: 'UYU' } },
      { ...maintenanceRecord, id: 10, status: 'cancelled', cost: { amount: '500.00', currency: 'UYU' } },
    ], meta: { current_page: 1, last_page: 2, total: 3 } });
    expect(totals).toEqual([]);
    const second = http.expectOne((request) => request.params.get('page') === '2');
    second.flush({ data: [
      { ...maintenanceRecord, id: 11, cost: { amount: '0.20', currency: 'UYU' } },
      { ...maintenanceRecord, id: 12, cost: { amount: '10.25', currency: 'USD' } },
    ], meta: { current_page: 2, last_page: 2, total: 3 } });
    expect(totals).toEqual([[{ currency: 'UYU', amount: '999999999999999.300' }, { currency: 'USD', amount: '10.250' }]]);
  });

  it('returns zero for an installation with no completed maintenance', () => {
    api.totalCost(22).subscribe((totals) => expect(totals).toEqual([{ currency: 'UYU', amount: '0.000' }]));
    http.expectOne('/api/v1/poultry-houses/22/maintenances?status=completed&page=1&per_page=100')
      .flush({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
  });

  it('fails instead of publishing a partial total when a later page fails', () => {
    let result: unknown; let failure: unknown;
    api.totalCost(22).subscribe({ next: (value) => result = value, error: (error: unknown) => failure = error });
    http.expectOne((request) => request.params.get('page') === '1')
      .flush({ data: [maintenanceRecord], meta: { current_page: 1, last_page: 2, total: 101 } });
    http.expectOne((request) => request.params.get('page') === '2').flush({}, { status: 500, statusText: 'Error' });
    expect(result).toBeUndefined(); expect(failure).toBeDefined();
  });

  it('cancels the pending total request when leaving the installation', () => {
    const subscription = api.totalCost(22).subscribe();
    const request = http.expectOne((request) => request.params.get('page') === '1');
    subscription.unsubscribe(); expect(request.cancelled).toBe(true);
  });

  it('reads, corrects and annuls a record using its version and reason', () => {
    api.detail(9).subscribe(); http.expectOne('/api/v1/maintenances/9').flush({ data: maintenanceRecord });
    api.correct(9, { description: 'Reparación', reason: 'Detalle incompleto', version: 3 }).subscribe();
    const edit = http.expectOne('/api/v1/maintenances/9'); expect(edit.request.method).toBe('PATCH');
    expect(edit.request.body).toEqual({ description: 'Reparación', reason: 'Detalle incompleto', version: 3 }); edit.flush({ data: maintenanceRecord });
    api.cancel(9, { reason: 'Duplicado', version: 3 }).subscribe();
    const cancel = http.expectOne('/api/v1/maintenances/9/cancellation'); expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body).toEqual({ reason: 'Duplicado', version: 3 }); cancel.flush({ data: maintenanceRecord });
  });
});
