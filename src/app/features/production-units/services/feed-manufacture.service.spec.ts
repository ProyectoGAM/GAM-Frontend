import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { FeedManufactureService } from './feed-manufacture.service';

describe('FeedManufactureService', () => {
  let service: FeedManufactureService;
  let http: HttpTestingController;
  const pending = { key: 'abbbbbbb-cccc-4ddd-8eee-ffffffffffff', request: { receta_id: 12, planta_id: 10, cantidad_g: '26000' } };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    service = TestBed.inject(FeedManufactureService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); sessionStorage.clear(); });

  it('loads all active recipe pages using the Spanish pagination contract', () => {
    let result: unknown;
    service.recipes().subscribe((recipes) => result = recipes);
    http.expectOne('/api/v1/recetas?estado=active&por_pagina=100&page=1').flush({ data: [{ id: 1 }], meta: { last_page: 2 } });
    http.expectOne('/api/v1/recetas?estado=active&por_pagina=100&page=2').flush({ data: [{ id: 2 }], meta: { last_page: 2 } });
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('calculates without a plant and confirms with a header key and exact grams', () => {
    service.calculate(12, '26000').subscribe();
    const calculation = http.expectOne('/api/v1/recetas/12/calculo');
    expect(calculation.request.body).toEqual({ cantidad_g: '26000' });
    calculation.flush({ data: {} });
    service.manufacture(pending.request, pending.key).subscribe();
    const operation = http.expectOne('/api/v1/elaboraciones');
    expect(operation.request.method).toBe('POST');
    expect(operation.request.headers.get('Idempotency-Key')).toBe(pending.key);
    expect(operation.request.body).toEqual(pending.request);
    operation.flush({ data: {} });
  });

  it('recovers the same pending payload after recreation, isolated by actor/session and plant', () => {
    service.rememberPending('1:session-a', pending);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    service = TestBed.inject(FeedManufactureService);
    http = TestBed.inject(HttpTestingController);
    expect(service.readPending('1:session-a', 10)).toEqual(pending);
    expect(service.readPending('2:session-a', 10)).toBeNull();
    expect(service.readPending('1:session-b', 10)).toBeNull();
    expect(service.readPending('1:session-a', 11)).toBeNull();
    service.forgetPending('1:session-a', 10);
    expect(service.readPending('1:session-a', 10)).toBeNull();
  });

  it('ignores malformed pending operations instead of replaying arbitrary stored content', () => {
    sessionStorage.setItem('gam.feed-manufacture.pending.v1:1:session-a:10', JSON.stringify({ ...pending, request: { ...pending.request, planta_id: 99 } }));
    expect(service.readPending('1:session-a', 10)).toBeNull();
  });
});
