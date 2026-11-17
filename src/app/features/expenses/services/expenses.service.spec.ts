import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { maintenanceHouse, maintenanceRecord } from '../../production-units/testing/maintenance-fixtures';
import { Expense } from '../interfaces/expense';
import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  let http: HttpTestingController;
  let service: ExpensesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
    ] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ExpensesService);
  });

  afterEach(() => http.verify());

  function request(path: string, page = 1) {
    return http.expectOne((req) => req.url === '/api/v1/' + path && (req.params.get('page') ?? '1') === String(page));
  }

  it('reads all source pages, excludes unfinished work and labels vehicle expenses as global', () => {
    let result: Expense[] | undefined;
    service.list([maintenanceHouse.production_unit], { fuel: true, maintenance: true }).subscribe((expenses) => result = expenses);
    request('production-units/7/poultry-houses').flush({ data: [maintenanceHouse], meta: { current_page: 1, last_page: 1 } });
    const firstHistoryPage = request('poultry-houses/22/maintenances');
    expect(firstHistoryPage.request.params.get('status')).toBe('completed');
    firstHistoryPage.flush({ data: [maintenanceRecord], meta: { current_page: 1, last_page: 2 } });
    request('poultry-houses/22/maintenances', 2).flush({
      data: [{ ...maintenanceRecord, id: 10, status: 'cancelled' }], meta: { current_page: 2, last_page: 2 },
    });
    request('vehiculos').flush({ data: [{ id: 'vehicle-a', plate: 'ABC 1234' }], meta: { current_page: 1, last_page: 2 } });
    request('vehiculos', 2).flush({ data: [], meta: { current_page: 2, last_page: 2 } });
    request('vehiculos/vehicle-a/combustible').flush({ data: {
      data: [{ id: 'fuel-a', occurred_at: '2026-01-03T01:30:00Z', fuel_type: 'Gasoil', amount: '10.125', currency: 'UYU' }],
      current_page: 1, last_page: 2,
    } });
    request('vehiculos/vehicle-a/combustible', 2).flush({ data: { data: [], current_page: 2, last_page: 2 } });
    request('vehiculos/vehicle-a/mantenimientos').flush({ data: {
      data: [
        { public_id: 'completed-a', status: 'completed', completed_at: '2026-01-04T15:00:00Z',
          description: 'Cambio de filtros', cost_amount: '20.50', cost_currency: 'UYU' },
        { public_id: 'planned-a', status: 'planned', completed_at: null, cost_amount: '30.00', cost_currency: 'UYU' },
      ],
      current_page: 1, last_page: 1,
    } });

    expect(result?.map(({ id, unit, date }) => [id, unit?.id ?? null, date])).toEqual([
      ['vehicle-maintenance:completed-a', null, '2026-01-04'],
      ['fuel:fuel-a', null, '2026-01-02'],
      ['installation:9', 7, '2026-01-01'],
    ]);
  });
});
