import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { SuppliersApi } from './suppliers.api';
import { StoreSupplierRequest, Supplier } from './suppliers.models';

const supplier: Supplier = {
  id: 17,
  name: 'Proveedor Norte',
  address: 'Ruta 5 km 24',
  status: 'active',
  locality: {
    id: 8,
    name: 'Las Piedras',
    department: { id: 2, name: 'Canelones' },
  },
  created_at: '2026-09-27T12:00:00.000000Z',
  updated_at: '2026-09-27T12:00:00.000000Z',
};

describe('Suppliers API contract', () => {
  let api: SuppliersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    api = TestBed.inject(SuppliersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists suppliers with supported filters and Laravel pagination', () => {
    api.list({ search: 'Proveedor Norte', status: 'active', per_page: 25 }, 2)
      .subscribe((response) => expect(response.data).toEqual([supplier]));

    const request = http.expectOne('/api/v1/suppliers?search=Proveedor%20Norte&status=active&per_page=25&page=2');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual(['search', 'status', 'per_page', 'page']);
    expect(request.request.params.get('search')).toBe('Proveedor Norte');
    expect(request.request.params.get('status')).toBe('active');
    expect(request.request.params.get('per_page')).toBe('25');
    expect(request.request.params.get('page')).toBe('2');
    request.flush({
      data: [supplier],
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 2, from: 26, last_page: 2, per_page: 25, to: 17, total: 42 },
    });
  });

  it('omits empty filters while retaining the requested page size and page', () => {
    api.list({ search: '  ', per_page: 50 }, 3).subscribe();

    const request = http.expectOne('/api/v1/suppliers?per_page=50&page=3');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual(['per_page', 'page']);
    request.flush({ data: [], links: {}, meta: { current_page: 3, last_page: 3, per_page: 50 } });
  });

  it('posts exactly the supplier fields and accepts the 201 resource response', () => {
    const body: StoreSupplierRequest = {
      name: 'Proveedor Norte',
      address: 'Ruta 5 km 24',
      locality_id: 8,
    };
    let response: unknown;
    api.create(body).subscribe((result) => (response = result));

    const request = http.expectOne('/api/v1/suppliers');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({ data: supplier }, { status: 201, statusText: 'Created' });

    expect(response).toEqual({ data: supplier });
  });

  it('allows creation without inventing a locality ID', () => {
    const body: StoreSupplierRequest = { name: 'Proveedor sin localidad', address: 'Ruta 8' };
    api.create(body).subscribe();

    const request = http.expectOne('/api/v1/suppliers');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Proveedor sin localidad', address: 'Ruta 8' });
    request.flush({ data: { ...supplier, name: body.name, address: body.address, locality: null } }, {
      status: 201,
      statusText: 'Created',
    });
  });

  it('patches only the supported supplier fields and returns the updated resource', () => {
    const body = { name: 'Proveedor actualizado', address: 'Ruta 6 km 12', locality_id: 8 };
    let response: unknown;
    api.updateSupplier(17, body).subscribe((result) => (response = result));

    const request = http.expectOne('/api/v1/suppliers/17');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(body);
    expect(Object.keys(request.request.body as object).sort()).toEqual(['address', 'locality_id', 'name']);
    request.flush({ data: { ...supplier, ...body } });

    expect(response).toEqual({ data: { ...supplier, ...body } });
  });

  it('changes supplier status with the exact status payload and returns the updated resource', () => {
    let response: unknown;
    api.changeSupplierStatus(17, 'inactive').subscribe((result) => (response = result));

    const request = http.expectOne('/api/v1/suppliers/17/status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'inactive' });
    expect(Object.keys(request.request.body as object)).toEqual(['status']);
    request.flush({ data: { ...supplier, status: 'inactive' } });

    expect(response).toEqual({ data: { ...supplier, status: 'inactive' } });
  });
});
