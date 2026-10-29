import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { FeedRecipesApi } from './feed-recipes.api';

describe('FeedRecipesApi', () => {
  let api: FeedRecipesApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    api = TestBed.inject(FeedRecipesApi); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('queries the global catalogue using Spanish filters and Laravel pagination', () => {
    api.list({ buscar: 'BB', estado: 'inactive', page: 2 }).subscribe();
    const request = http.expectOne('/api/v1/recetas?buscar=BB&estado=inactive&page=2&por_pagina=25');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [], links: {}, meta: { current_page: 2, last_page: 2, per_page: 25, total: 25 } });
  });
  it('omits empty filters and reads a recipe without any stock or UP parameters', () => {
    api.list({ buscar: '', estado: '', page: 1 }).subscribe();
    http.expectOne('/api/v1/recetas?page=1&por_pagina=25').flush({ data: [] });
    api.get('24').subscribe();
    const request = http.expectOne('/api/v1/recetas/24'); expect(request.request.method).toBe('GET');
    request.flush({ data: { id: 24 } });
  });
  it('creates using only the contracted recipe data and a header idempotency key', () => {
    const body = { nombre: 'Ración BB', nota: null, rendimiento_g: '13000', ingredientes: [{ producto_id: 1, cantidad_g: '12500' }] };
    api.create(body, 'stable-key').subscribe();
    const request = http.expectOne('/api/v1/recetas');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual(body);
    expect(request.request.headers.get('Idempotency-Key')).toBe('stable-key');
    request.flush({ data: { id: 3 } });
  });
  it('loads every material page without excluding inactive products or requiring stock', () => {
    const result = vi.fn(); api.materials().subscribe(result);
    const material = { id: 2, name: 'Soja', sku: 'SOJA', kind: 'raw_material', base_unit: 'g', stock_tracked: true, status: 'inactive' };
    http.expectOne('/api/v1/products?kind=raw_material&per_page=100&page=1').flush({ data: [material], meta: { current_page: 1, last_page: 2 } });
    expect(result).not.toHaveBeenCalled();
    http.expectOne('/api/v1/products?kind=raw_material&per_page=100&page=2').flush({ data: [
      { ...material, id: 1, name: 'Maíz', status: 'active' }, { ...material, id: 3, kind: 'egg' }, { ...material, id: 4, base_unit: 'kg' }, { ...material, id: 5, stock_tracked: false },
    ], meta: { current_page: 2, last_page: 2 } });
    expect(result.mock.calls[0][0].map((item: { id: number }) => item.id)).toEqual([1, 2]);
    expect(result.mock.calls[0][0][1].status).toBe('inactive');
  });
});
