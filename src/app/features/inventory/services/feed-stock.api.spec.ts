import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { FeedStockApi } from './feed-stock.api';

describe('FeedStockApi', () => {
  let api: FeedStockApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    api = TestBed.inject(FeedStockApi); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('uses the server filters and pagination without filtering by plant', () => {
    api.balances({ up_id: 7, receta_id: 4, requiere_atencion: true, page: 2 }).subscribe();
    const req = http.expectOne((request) => request.url === '/api/v1/saldos-alimento');
    expect(req.request.params.keys().sort()).toEqual(['page', 'por_pagina', 'receta_id', 'requiere_atencion', 'up_id']);
    expect(req.request.params.get('up_id')).toBe('7');
    expect(req.request.params.get('receta_id')).toBe('4');
    expect(req.request.params.get('requiere_atencion')).toBe('1');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('por_pagina')).toBe('25');
    req.flush({ data: [] });
  });

  it('distinguishes omitted attention from explicitly false', () => {
    for (const attention of [undefined, false]) {
      api.balances({ up_id: 7, requiere_atencion: attention }).subscribe();
      const req = http.expectOne((request) => request.url.endsWith('/saldos-alimento'));
      expect(req.request.params.get('requiere_atencion')).toBe(attention === undefined ? null : '0');
      req.flush({ data: [] });
    }
  });

  it('looks up an unmaterialized account and patches exact grams, zero and null', () => {
    api.balance(7, 4).subscribe();
    http.expectOne('/api/v1/unidades-productivas/7/recetas/4/saldo').flush({ data: {} });
    for (const minimum of ['999999999999', '0', null]) {
      api.setMinimum(7, 4, minimum).subscribe();
      const req = http.expectOne('/api/v1/unidades-productivas/7/recetas/4/minimo');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ minimo_g: minimum });
      expect(req.request.headers.has('Idempotency-Key')).toBe(false);
      req.flush({ data: {} });
    }
  });

  it('loads every catalog page including inactive recipes', () => {
    let recipes: unknown;
    api.recipes().subscribe((value) => recipes = value);
    const first = http.expectOne('/api/v1/recetas?por_pagina=100&page=1');
    expect(first.request.params.has('estado')).toBe(false);
    first.flush({ data: [{ id: 1, estado: 'active' }], meta: { last_page: 2 } });
    http.expectOne('/api/v1/recetas?por_pagina=100&page=2').flush({ data: [{ id: 2, estado: 'inactive' }] });
    expect(recipes).toEqual([{ id: 1, estado: 'active' }, { id: 2, estado: 'inactive' }]);
  });
});
