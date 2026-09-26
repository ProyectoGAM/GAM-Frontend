import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { EggStockApi } from './egg-stock.api';
import { InventoryApi } from './inventory.api';
import { InventoryReferenceApi } from './inventory-reference.api';

describe('Inventory API contracts', () => {
  let generic: InventoryApi;
  let references: InventoryReferenceApi;
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
    references = TestBed.inject(InventoryReferenceApi);
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

  it('preserves the generic receipt payload and idempotency key', () => {
    const body = {
      supplier_id: 7,
      occurred_at: '2026-09-26',
      reason: 'Compra semanal',
      reference_type: 'purchase_order',
      reference_id: 'PO-18',
      lines: [{ product_id: 4, stock_location_id: 2, quantity: '12.5' }],
    };
    generic.receive(body, 'receipt-key').subscribe();

    const request = http.expectOne('/api/v1/inventory/receipts');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('receipt-key');
    expect(request.request.body).toEqual(body);
    request.flush({ data: {} });
  });

  it('preserves the generic issue payload and idempotency key', () => {
    const body = {
      occurred_at: '2026-09-26',
      reason: 'Uso diario',
      reference_type: 'work_order',
      reference_id: 'WO-3',
      lines: [{ product_id: 4, stock_location_id: 2, quantity: '2' }],
    };
    generic.issue(body, 'issue-key').subscribe();

    const request = http.expectOne('/api/v1/inventory/issues');
    expect(request.request.headers.get('Idempotency-Key')).toBe('issue-key');
    expect(request.request.body).toEqual(body);
    request.flush({ data: {} });
  });

  it('preserves the generic loss payload and idempotency key', () => {
    const body = {
      reason: 'Producto dañado',
      occurred_at: '2026-09-26',
      lines: [{ product_id: 4, stock_location_id: 2, quantity: '1.25' }],
    };
    generic.loss(body, 'loss-key').subscribe();

    const request = http.expectOne('/api/v1/inventory/losses');
    expect(request.request.headers.get('Idempotency-Key')).toBe('loss-key');
    expect(request.request.body).toEqual(body);
    request.flush({ data: {} });
  });

  it('preserves distinct transfer locations and the idempotency key', () => {
    const body = {
      reason: 'Cambio de depósito',
      occurred_at: '2026-09-26',
      lines: [{ product_id: 4, from_stock_location_id: 2, to_stock_location_id: 9, quantity: '3' }],
    };
    generic.transfer(body, 'transfer-key').subscribe();

    const request = http.expectOne('/api/v1/inventory/transfers');
    expect(request.request.headers.get('Idempotency-Key')).toBe('transfer-key');
    expect(request.request.body).toEqual(body);
    request.flush({ data: {} });
  });

  it('loads reference options from the existing options endpoint', () => {
    references.options().subscribe((response) => expect(response.data.stock_locations[0].label).toBe('Depósito principal'));

    const request = http.expectOne('/api/v1/reference/options');
    expect(request.request.method).toBe('GET');
    request.flush({ data: {
      production_units: [], suppliers: [], products: [],
      stock_locations: [{ value: 2, label: 'Depósito principal' }],
      types: { products: [], base_units: [], movements: [] },
      statuses: { production_units: [], products: [], stock_locations: [] },
    } });
  });

  it('preserves the egg receipt, issue, loss and correction contracts', () => {
    const receipt = { quantity: 120, occurred_at: '2026-09-26T13:00:00Z', reason: 'Recogida', notes: 'Galpón 1' };
    eggs.receipt(19, receipt, 'egg-receipt-key').subscribe();
    const receiptRequest = http.expectOne('/api/v1/production-units/19/egg-stock/receipts');
    expect(receiptRequest.request.method).toBe('POST');
    expect(receiptRequest.request.headers.get('Idempotency-Key')).toBe('egg-receipt-key');
    expect(receiptRequest.request.body).toEqual(receipt);
    receiptRequest.flush({ data: {} });

    const issue = { quantity: 20, type: 'distribution_preparation' as const, reason: 'Preparación de reparto' };
    eggs.issue(19, issue, 'egg-issue-key').subscribe();
    const issueRequest = http.expectOne('/api/v1/production-units/19/egg-stock/issues');
    expect(issueRequest.request.headers.get('Idempotency-Key')).toBe('egg-issue-key');
    expect(issueRequest.request.body).toEqual(issue);
    issueRequest.flush({ data: {} });

    const loss = { quantity: 3, type: 'loss' as const, reason: 'Huevos dañados' };
    eggs.issue(19, loss, 'egg-loss-key').subscribe();
    const lossRequest = http.expectOne('/api/v1/production-units/19/egg-stock/issues');
    expect(lossRequest.request.headers.get('Idempotency-Key')).toBe('egg-loss-key');
    expect(lossRequest.request.body).toEqual(loss);
    lossRequest.flush({ data: {} });

    const correction = { version: 4, quantity: 7, correction_reason: 'Conteo verificado' };
    eggs.correct('01JTESTMOVEMENT', correction, 'egg-correction-key').subscribe();
    const correctionRequest = http.expectOne('/api/v1/egg-stock/movements/01JTESTMOVEMENT');
    expect(correctionRequest.request.method).toBe('PATCH');
    expect(correctionRequest.request.headers.get('Idempotency-Key')).toBe('egg-correction-key');
    expect(correctionRequest.request.body).toEqual(correction);
    correctionRequest.flush({ data: {} });
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
