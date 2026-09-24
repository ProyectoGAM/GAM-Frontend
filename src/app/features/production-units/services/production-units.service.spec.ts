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
});
