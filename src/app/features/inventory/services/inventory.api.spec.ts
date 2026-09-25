import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { EggStockApi } from './egg-stock.api';
import { InventoryApi } from './inventory.api';

describe('Inventory API contracts', () => {
  let generic: InventoryApi;
  let eggs: EggStockApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    generic = TestBed.inject(InventoryApi);
    eggs = TestBed.inject(EggStockApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends counted quantities and the idempotency key for generic adjustments', () => {
    generic.adjustment({
      reason: 'Conteo físico',
      lines: [{ product_id: 4, stock_location_id: 2, counted_quantity: '12.340000' }],
    }, '00000000-0000-4000-8000-000000000001').subscribe();

    const request = http.expectOne('/api/v1/inventory/adjustments');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('00000000-0000-4000-8000-000000000001');
    expect(request.request.body).toEqual({
      reason: 'Conteo físico',
      lines: [{ product_id: 4, stock_location_id: 2, counted_quantity: '12.340000' }],
    });
    request.flush({ data: {} });
  });

  it('uses the specialized egg endpoint for cancellation', () => {
    eggs.cancel('01JTESTMOVEMENT', { version: 3, correction_reason: 'Duplicado' }, '00000000-0000-4000-8000-000000000002').subscribe();

    const request = http.expectOne('/api/v1/egg-stock/movements/01JTESTMOVEMENT/cancellation');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('00000000-0000-4000-8000-000000000002');
    expect(request.request.body).toEqual({ version: 3, correction_reason: 'Duplicado' });
    request.flush({ data: {} });
  });
});
