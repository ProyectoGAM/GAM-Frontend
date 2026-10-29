import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth/auth.store';
import { DeliveryOutboxService } from './delivery-outbox.service';

describe('DeliveryOutboxService identity and storage boundaries', () => {
  let service: DeliveryOutboxService;
  const user = signal<{ id: number } | null>({ id: 2 });
  beforeEach(() => {
    user.set({ id: 2 });
    TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: { user } }] });
    service = TestBed.inject(DeliveryOutboxService);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('refuses a payment when durable storage is unavailable instead of accepting it in memory', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(service.enqueue({ kind: 'payment', deliveryId: 'delivery', payload: { client_reference: 'client', client_event_id: 'event', amount: '10.125', payment_method: 'cash' }, idempotencyKey: 'event' })).rejects.toThrow('almacenamiento durable');
  });
  it('refuses reading another actor reference cache before opening storage', async () => {
    await expect(service.referencesFor(1)).rejects.toThrow('sesión cambió');
  });
  it('refuses listing or sending a previous actor queue after logout', async () => {
    user.set(null);
    await expect(service.list()).rejects.toThrow('Iniciá sesión');
    await expect(service.enqueue({ kind: 'load', deliveryId: 'delivery', payload: { quantity: 10 }, idempotencyKey: 'event' })).rejects.toThrow('Iniciá sesión');
  });
});
