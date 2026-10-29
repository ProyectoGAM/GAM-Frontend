import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { HealthCatalogsApi } from './health-catalogs.api';
import { healthPage, medicine, vaccine } from '../testing/health-catalog-fixtures';

describe('Health catalog API contracts', () => {
  let api: HealthCatalogsApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    api = TestBed.inject(HealthCatalogsApi); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('sends vaccine-specific filters and maps the current provider and creation metadata', () => {
    const result = vi.fn();
    api.list('vaccines', { search: 'VAC', supplier: '4', status: 'inactive', sku: 'VAC-01', page: 2 }).subscribe(result);
    const request = http.expectOne((item) => item.url === '/api/v1/vacunas');
    expect(request.request.params.keys().sort()).toEqual(['buscar', 'estado', 'page', 'per_page', 'proveedor_id', 'sku']);
    expect(request.request.params.get('proveedor_id')).toBe('4'); expect(request.request.params.get('page')).toBe('2');
    request.flush(healthPage([vaccine]));
    expect(result).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ supplier: 'Proveedor actual', creator: 'María', vaccine: expect.objectContaining({ sku: 'VAC-01' }) })] }));
  });
  it('does not send unsupported vaccine filters to medicines and uses supplier/creator snapshots', () => {
    const result = vi.fn();
    api.list('medicines', { search: 'Med', supplier: '4', status: 'active', sku: 'ignored', page: 1 }).subscribe(result);
    const request = http.expectOne((item) => item.url === '/api/v1/medicines');
    expect(request.request.params.keys().sort()).toEqual(['page', 'per_page', 'search', 'supplier_id']);
    request.flush(healthPage([medicine]));
    expect(result).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ productId: medicine.product_id, supplier: 'Proveedor al registrar', creator: 'María al registrar' })] }));
  });
  it('sends creation bodies unchanged with the idempotency header and retrieves vaccine details', () => {
    const body = { sku: 'VAC-01', nombre: 'Vacuna A', descripcion: 'Descripción', proveedor_id: 4, detalles: null };
    api.create('vaccines', body, 'same-key').subscribe();
    const create = http.expectOne('/api/v1/vacunas');
    expect(create.request.method).toBe('POST'); expect(create.request.body).toEqual(body);
    expect(create.request.headers.get('Idempotency-Key')).toBe('same-key'); create.flush({ data: vaccine });
    api.create('medicines', { name: 'Med', description: 'Texto', supplier_id: 4 }, 'medicine-key').subscribe();
    const medicineRequest = http.expectOne('/api/v1/medicines');
    expect(medicineRequest.request.headers.get('Idempotency-Key')).toBe('medicine-key'); medicineRequest.flush({ data: medicine });
    const detail = vi.fn(); api.vaccine(vaccine.id).subscribe(detail);
    http.expectOne('/api/v1/vacunas/' + vaccine.id).flush({ data: vaccine });
    expect(detail).toHaveBeenCalledWith(expect.objectContaining({ id: vaccine.id, name: 'Vacuna A' }));
  });
  it('loads all supplier pages, deduplicates IDs and offers only active suppliers for creation', () => {
    const result = vi.fn(); api.suppliers(true).subscribe(result);
    const first = http.expectOne((item) => item.url === '/api/v1/suppliers' && item.params.get('page') === '1');
    expect(first.request.params.get('status')).toBe('active'); expect(first.request.params.get('per_page')).toBe('100');
    first.flush(healthPage([{ id: 4, name: 'Zeta', status: 'active' }], 1, 2));
    http.expectOne((item) => item.params.get('page') === '2').flush(healthPage([
      { id: 4, name: 'Zeta', status: 'active' }, { id: 5, name: 'Alfa', status: 'active' }, { id: 6, name: 'Baja', status: 'inactive' },
    ], 2, 2));
    expect(result).toHaveBeenCalledWith([{ id: 5, name: 'Alfa', status: 'active' }, { id: 4, name: 'Zeta', status: 'active' }]);
  });
});
