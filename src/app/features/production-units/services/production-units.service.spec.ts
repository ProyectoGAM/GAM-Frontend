import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { ProductionUnitsService } from './production-units.service';

describe('ProductionUnitsService', () => {
  let service: ProductionUnitsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    service = TestBed.inject(ProductionUnitsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads every backend page and combines units in page order', () => {
    let result: unknown;
    service.listAll().subscribe((units) => (result = units));

    const first = http.expectOne('/api/v1/production-units?page=1&per_page=100');
    first.flush({ data: [{ id: 1, name: 'Norte' }], meta: { current_page: 1, last_page: 2 } });

    const second = http.expectOne('/api/v1/production-units?page=2&per_page=100');
    second.flush({ data: [{ id: 2, name: 'Sur' }], meta: { current_page: 2, last_page: 2 } });

    expect(result).toEqual([{ id: 1, name: 'Norte' }, { id: 2, name: 'Sur' }]);
  });

  it('loads every page of departments and localities from their documented paths', () => {
    let departments: unknown;
    service.departments().subscribe((result) => (departments = result));
    http.expectOne('/api/v1/departments?page=1&per_page=100')
      .flush({ data: [{ id: 1, name: 'Canelones' }], meta: { current_page: 1, last_page: 1 } });
    expect(departments).toEqual([{ id: 1, name: 'Canelones' }]);

    let localities: unknown;
    service.localities(1).subscribe((result) => (localities = result));
    http.expectOne('/api/v1/departments/1/localities?page=1&per_page=100')
      .flush({ data: [{ id: 8, department_id: 1, name: 'Las Piedras' }], meta: { current_page: 1, last_page: 2 } });
    http.expectOne('/api/v1/departments/1/localities?page=2&per_page=100')
      .flush({ data: [{ id: 9, department_id: 1, name: 'Progreso' }], meta: { current_page: 2, last_page: 2 } });
    expect(localities).toEqual([
      { id: 8, department_id: 1, name: 'Las Piedras' },
      { id: 9, department_id: 1, name: 'Progreso' },
    ]);
  });

  it('posts only the backend production-unit fields', () => {
    const request = {
      locality_id: 8,
      name: 'Granja Norte',
      latitude: -34.9,
      longitude: -56.2,
      status: 'active' as const,
    };

    service.create(request).subscribe();
    const create = http.expectOne('/api/v1/production-units');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(request);
    create.flush({ data: { id: 5, name: request.name } });
  });

  it('loads unit detail and every paginated poultry-house page', () => {
    let unit: unknown;
    service.getById(17).subscribe((result) => (unit = result));
    const detail = http.expectOne('/api/v1/production-units/17');
    expect(detail.request.method).toBe('GET');
    detail.flush({ data: { id: 17, name: 'Granja Este' } });
    expect(unit).toEqual({ data: { id: 17, name: 'Granja Este' } });

    let houses: unknown;
    service.poultryHouses(17).subscribe((result) => (houses = result));
    http.expectOne('/api/v1/production-units/17/poultry-houses?page=1&per_page=100')
      .flush({ data: [{ id: 4, name: 'Galpón 4', status: 'inactive', bird_capacity: 2000, current_occupancy: 0 }], meta: { current_page: 1, last_page: 1 } });
    expect(houses).toEqual([{ id: 4, name: 'Galpón 4', status: 'inactive', bird_capacity: 2000, current_occupancy: 0 }]);
  });

  it('updates editable fields and switches between the two supported states', () => {
    const fields = { name: 'Granja Actualizada', locality_id: 8, latitude: -34.9, longitude: -56.2 };
    service.update(17, fields).subscribe();
    const update = http.expectOne('/api/v1/production-units/17');
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual(fields);
    update.flush({ data: { id: 17, name: fields.name } });

    service.updateStatus(17, 'inactive').subscribe();
    const updateStatus = http.expectOne('/api/v1/production-units/17/status');
    expect(updateStatus.request.method).toBe('PATCH');
    expect(updateStatus.request.body).toEqual({ status: 'inactive' });
    updateStatus.flush({ data: { id: 17, name: fields.name, status: 'inactive' } });

    service.updateStatus(17, 'active').subscribe();
    const reactivate = http.expectOne('/api/v1/production-units/17/status');
    expect(reactivate.request.method).toBe('PATCH');
    expect(reactivate.request.body).toEqual({ status: 'active' });
    reactivate.flush({ data: { id: 17, name: fields.name, status: 'active' } });
  });
});
