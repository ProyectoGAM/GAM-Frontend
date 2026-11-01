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
