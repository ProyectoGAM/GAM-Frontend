import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { FeedSuppliesService } from './feed-supplies.service';

describe('Feed supply contract', () => {
  it('preserves exact decimal quantity and idempotency for registration and cancellation', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    const api = TestBed.inject(FeedSuppliesService); const http = TestBed.inject(HttpTestingController);
    api.record('lot-1', { product_id: 2, quantity: '10.500001', unit: 'kg', occurred_at: '2026-10-12T12:00:00Z' }, 'same-key').subscribe();
    const record = http.expectOne('/api/v1/flocks/lot-1/alimentacion'); expect(record.request.body.quantity).toBe('10.500001'); expect(record.request.headers.get('Idempotency-Key')).toBe('same-key'); record.flush({ data: {} });
    api.cancel('lot-1', 'supply-1', 'Corrección', 'cancel-key').subscribe(); const cancel = http.expectOne('/api/v1/flocks/lot-1/alimentacion/supply-1/anulacion'); expect(cancel.request.headers.get('Idempotency-Key')).toBe('cancel-key'); expect(cancel.request.body).toEqual({ reason: 'Corrección' }); cancel.flush({ data: {} }); http.verify();
  });
});
