import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { FlockStatusService } from './flock-status.service';
import { fractionationFlock } from '../testing/fractionation-fixture';

describe('FlockStatusService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
    { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
  ] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('finalizes through the dedicated endpoint without sending a status or frontend confirmation field', () => {
    const body = { version: 2, reason: 'Fin del ciclo productivo' };
    const received = vi.fn();
    TestBed.inject(FlockStatusService).finalize('lot/id', body, 'finalization-key').subscribe(received);
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/flocks/lot%2Fid/finalization');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(request.request.headers.get('Idempotency-Key')).toBe('finalization-key');
    const result = { operation_id: 'op', flock: fractionationFlock({ status: 'finished', current_quantity: 0, version: 3 }) };
    request.flush({ data: result });
    expect(received).toHaveBeenCalledExactlyOnceWith(result);
  });

  it('patches the public status endpoint with optimistic version, reason and idempotency header', () => {
    const body = { version: 2, status: 'quarantined' as const, reason: 'Control sanitario' };
    const received = vi.fn();
    TestBed.inject(FlockStatusService).change('lot/id', body, 'stable-key').subscribe(received);
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/flocks/lot%2Fid/status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(body);
    expect(request.request.headers.get('Idempotency-Key')).toBe('stable-key');
    const result = { operation_id: 'op', flock: fractionationFlock({ status: 'quarantined', version: 3 }) };
    request.flush({ data: result });
    expect(received).toHaveBeenCalledExactlyOnceWith(result);
  });
});
