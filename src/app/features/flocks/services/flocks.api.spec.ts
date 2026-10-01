import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { FlocksApi } from './flocks.api';

describe('FlocksApi', () => {
  let api: FlocksApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    api = TestBed.inject(FlocksApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the documented unit and search filters and combines every page', () => {
    let result: unknown;
    api.list({ production_unit_id: 12, search: 'Ombú' }).subscribe((flocks) => (result = flocks));

    const firstPage = http.expectOne((request) => request.url === '/api/v1/flocks'
      && request.params.get('production_unit_id') === '12'
      && request.params.get('search') === 'Ombú'
      && request.params.get('page') === '1'
      && request.params.get('per_page') === '100');
    firstPage.flush({
      data: [{ id: 'flock-1', code: 'A-24' }],
      links: {},
      meta: { current_page: 1, last_page: 2, per_page: 100, total: 2 },
    });

    const secondPage = http.expectOne((request) => request.url === '/api/v1/flocks'
      && request.params.get('production_unit_id') === '12'
      && request.params.get('search') === 'Ombú'
      && request.params.get('page') === '2'
      && request.params.get('per_page') === '100');
    secondPage.flush({
      data: [{ id: 'flock-2', code: 'B-07' }],
      links: {},
      meta: { current_page: 2, last_page: 2, per_page: 100, total: 2 },
    });

    expect(result).toEqual([
      { id: 'flock-1', code: 'A-24' },
      { id: 'flock-2', code: 'B-07' },
    ]);
  });

  it('omits the UP parameter for the global all-units view', () => {
    api.list().subscribe();

    const request = http.expectOne('/api/v1/flocks?page=1&per_page=100');
    expect(request.request.params.has('production_unit_id')).toBe(false);
    request.flush({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 },
    });
  });
});
