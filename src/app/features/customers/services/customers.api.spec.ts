import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_CONFIG } from '../../../core/config/api.config';
import { CustomersApi } from './customers.api';

describe('CustomersApi', () => {
  let api: CustomersApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    api = TestBed.inject(CustomersApi); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('pages customer search on the server', () => {
    api.list({ search: '100%', status: 'active', account_status: 'debt', per_page: 25 }, 3).subscribe();
    const request = http.expectOne((r) => r.url === '/api/v1/clientes');
    expect(request.request.params.get('search')).toBe('100%');
    expect(request.request.params.get('page')).toBe('3');
    expect(request.request.params.get('account_status')).toBe('debt');
    request.flush({ data: [], meta: { current_page: 3, last_page: 3, per_page: 25, total: 50 } });
  });

  it('does not invent required fiscal values when creating a customer', () => {
    api.create({}, 'create-key').subscribe();
    const request = http.expectOne('/api/v1/clientes');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.get('Idempotency-Key')).toBe('create-key');
    request.flush({ data: { id: 'customer' } });
  });

  it('sends exact payment text separately from balance and actor', () => {
    api.pay('client', { amount: '12.625', payment_method: 'transfer', payment_reference: 'Comprobante' }, 'payment-key').subscribe();
    const request = http.expectOne('/api/v1/clientes/client/pagos');
    expect(request.request.body).toEqual({ amount: '12.625', payment_method: 'transfer', payment_reference: 'Comprobante' });
    expect(request.request.headers.get('Idempotency-Key')).toBe('payment-key');
    request.flush({ data: [] });
  });

  it('sends versioned adjustment and reasoned reversal through their owning endpoints', () => {
    api.adjust('client', { direction: 'decrease', amount: '150.125', reason: 'Acuerdo', expected_version: 7 }, 'adjust-key').subscribe();
    const adjustment = http.expectOne('/api/v1/clientes/client/ajustes');
    expect(adjustment.request.body.expected_version).toBe(7);
    expect(adjustment.request.body.amount).toBe('150.125');
    adjustment.flush({ data: [] });
    api.reverse('client', 'movement', 'Corrección', 'reverse-key').subscribe();
    const reversal = http.expectOne('/api/v1/clientes/client/movimientos/movement/reversion');
    expect(reversal.request.body).toEqual({ reason: 'Corrección' });
    reversal.flush({ data: [] });
  });
});
