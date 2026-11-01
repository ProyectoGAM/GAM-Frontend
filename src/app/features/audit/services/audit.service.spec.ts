import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let api: AuditService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    api = TestBed.inject(AuditService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('queries all audit entries without silently applying the sidebar unit or a module', () => {
    api.entries({ page: 1, per_page: 25 }).subscribe();
    const request = http.expectOne('/api/v1/audit/entries?page=1&per_page=25');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [] });
  });

  it('sends the documented exact filters and pagination to the server', () => {
    api.entries({ log_name: 'inventory', actor_kind: 'person', actor_type: 'App\\Models\\User', actor_id: 12, from: '2026-10-01', to: '2026-10-30', source: 'api', event: 'stock_moved', up_id: 3, page: 2 }).subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/audit/entries');
    expect(request.request.params.get('log_name')).toBe('inventory');
    expect(request.request.params.get('actor_id')).toBe('12');
    expect(request.request.params.get('up_id')).toBe('3');
    expect(request.request.params.get('from')).toBe('2026-10-01');
    expect(request.request.params.get('to')).toBe('2026-10-30');
    expect(request.request.params.get('source')).toBe('api');
    expect(request.request.params.get('event')).toBe('stock_moved');
    expect(request.request.params.get('actor_kind')).toBe('person');
    expect(request.request.params.get('actor_type')).toBe('App\\Models\\User');
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ data: [] });
  });

  it('gets filter choices from reference data', () => {
    api.options().subscribe();
    http.expectOne('/api/v1/reference/options').flush({ data: { audit: { events: [], sources: [] }, production_units: [] } });
  });

  it('queries detail separately and searches a single actors page without the user directory', () => {
    api.detail(901).subscribe();
    http.expectOne('/api/v1/auditoria/entradas/901').flush({ data: {} });
    api.responsibles('Ana & María', 2).subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/auditoria/responsables');
    expect(request.request.params.get('buscar')).toBe('Ana & María');
    expect(request.request.params.get('por_pagina')).toBe('25');
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ data: [] });
  });

  it('omits an empty search term because the server validates supplied terms as nonempty strings', () => {
    api.responsibles().subscribe();
    const request = http.expectOne('/api/v1/auditoria/responsables?por_pagina=25&page=1');
    expect(request.request.params.has('buscar')).toBe(false);
    request.flush({ data: [] });
  });
});
