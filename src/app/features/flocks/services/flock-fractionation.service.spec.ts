import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { API_CONFIG } from '../../../core/config/api.config';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { fractionationFixture } from '../testing/fractionation-fixture';
import { FlockDetailService } from './flock-detail.service';
import { FlocksApi } from './flocks.api';
import { FlockFractionationService } from './flock-fractionation.service';

describe('FlockFractionationService', () => {
  const fixture = fractionationFixture();
  const list = vi.fn(() => of(fixture.flocks));
  const houses = vi.fn(() => of(fixture.houses));
  beforeEach(() => {
    list.mockClear(); houses.mockClear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      { provide: FlockDetailService, useValue: { flock: () => of(fixture.source) } },
      { provide: FlocksApi, useValue: { list } },
      { provide: ProductionUnitsService, useValue: { poultryHouses: houses, getById: () => of({ data: { name: fixture.unitName } }) } },
    ] });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('loads every destination from the original lot UP, independently of dashboard selection', () => {
    const result = vi.fn();
    TestBed.inject(FlockFractionationService).load('source').subscribe(result);
    expect(list).toHaveBeenCalledExactlyOnceWith({ production_unit_id: 7 });
    expect(houses).toHaveBeenCalledExactlyOnceWith(7, 'poultry');
    expect(result).toHaveBeenCalledWith(fixture);
  });
  it('sends both versions and the idempotency key to the existing redistribution contract', () => {
    const body = { version: 2, quantity: 120, destination_flock_id: 'receiver', destination_version: 8 };
    const result = vi.fn();
    TestBed.inject(FlockFractionationService).submit('source', body, 'stable-key').subscribe(result);
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/flocks/source/redistributions');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('stable-key');
    expect(request.request.body).toEqual(body);
    const operation = { operation_id: 'op', destination_flock: { id: 'receiver', code: 'L-018' } };
    request.flush({ data: operation });
    expect(result).toHaveBeenCalledExactlyOnceWith(operation);
  });
});
