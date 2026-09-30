import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { ProductsApi } from './products.api';
import { Product, ProductInput } from './products.models';

const product: Product = {
  id: 17,
  sku: 'AL-17',
  name: 'Alimento inicial',
  kind: 'supply',
  base_unit: 'kg',
  stock_tracked: true,
  status: 'active',
  system_managed: false,
  specialized_owner: null,
  capabilities: { editable_fields: ['sku', 'name', 'kind', 'base_unit', 'stock_tracked'], activate: false, deactivate: true },
};

describe('Products API contract', () => {
  let api: ProductsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    api = TestBed.inject(ProductsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the paginated products collection with GET /products', () => {
    api.list().subscribe((response) => expect(response.data).toEqual([product]));

    const request = http.expectOne('/api/v1/products?page=1');
    expect(request.request.method).toBe('GET');
    request.flush({
      data: [product],
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, from: 1, last_page: 1, per_page: 25, to: 1, total: 1 },
    });
  });

  it('sends the requested page for paginated results', () => {
    api.list(3).subscribe();

    const request = http.expectOne('/api/v1/products?page=3');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [], links: {}, meta: { current_page: 3, last_page: 3 } });
  });

  it('posts the exact product fields and accepts the 201 data resource', () => {
    const body: ProductInput = {
      sku: 'AL-17',
      name: 'Alimento inicial',
      kind: 'supply',
      base_unit: 'kg',
      stock_tracked: true,
    };
    api.create(body).subscribe((response) => expect(response.data).toEqual(product));

    const request = http.expectOne('/api/v1/products');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({ data: product }, { status: 201, statusText: 'Created' });
  });

  it('loads a product detail by its numeric identifier', () => {
    api.get(17).subscribe((response) => expect(response.data).toEqual(product));

    const request = http.expectOne('/api/v1/products/17');
    expect(request.request.method).toBe('GET');
    request.flush({ data: product });
  });

  it('patches only the provided product fields', () => {
    const body = { name: 'Ración de inicio' };
    api.update(17, body).subscribe();

    const request = http.expectOne('/api/v1/products/17');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(body);
    request.flush({ data: { ...product, ...body } });
  });

  it('sends the status value under the exact status field', () => {
    api.setStatus(17, 'inactive').subscribe();

    const request = http.expectOne('/api/v1/products/17/status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'inactive' });
    request.flush({ data: { ...product, status: 'inactive' } });
  });
});
