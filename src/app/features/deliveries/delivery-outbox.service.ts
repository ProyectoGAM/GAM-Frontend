import { Injectable } from '@angular/core';

import { AddDeliveryLoadInput, CloseDeliveryInput, LocationInput, StopInput } from './delivery.models';

export type DeliveryOutboxKind = 'load' | 'stop' | 'locations' | 'close';

export interface DeliveryOutboxEntry {
  id: string;
  kind: DeliveryOutboxKind;
  deliveryId: string;
  payload: AddDeliveryLoadInput | StopInput | { locations: LocationInput[] } | Omit<CloseDeliveryInput, 'pin'>;
  idempotencyKey: string | null;
  createdAt: string;
  attempts: number;
}

const DATABASE_NAME = 'gam-deliveries';
const STORE_NAME = 'outbox';

@Injectable({ providedIn: 'root' })
export class DeliveryOutboxService {
  private databasePromise: Promise<IDBDatabase | null> | null = null;
  private readonly memory = new Map<string, DeliveryOutboxEntry>();

  async enqueue(entry: Omit<DeliveryOutboxEntry, 'id' | 'createdAt' | 'attempts'>): Promise<void> {
    const value: DeliveryOutboxEntry = {
      ...entry,
      id: this.newId(),
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    const database = await this.database();

    if (!database) {
      this.memory.set(value.id, value);
      return;
    }

    await this.request(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).add(value));
  }

  async list(deliveryId?: string): Promise<DeliveryOutboxEntry[]> {
    const database = await this.database();

    if (!database) {
      return [...this.memory.values()].filter((entry) => !deliveryId || entry.deliveryId === deliveryId);
    }

    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = deliveryId
      ? transaction.objectStore(STORE_NAME).index('deliveryId').getAll(deliveryId)
      : transaction.objectStore(STORE_NAME).getAll();

    return this.request(request);
  }

  async remove(id: string): Promise<void> {
    const database = await this.database();

    if (!database) {
      this.memory.delete(id);
      return;
    }

    await this.request(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id));
  }

  async count(deliveryId: string): Promise<number> {
    return (await this.list(deliveryId)).length;
  }

  private database(): Promise<IDBDatabase | null> {
    if (this.databasePromise) return this.databasePromise;
    if (typeof globalThis.indexedDB === 'undefined') return Promise.resolve(null);

    this.databasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DATABASE_NAME, 1);
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la cola local.'));
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('deliveryId', 'deliveryId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      };
    });

    return this.databasePromise;
  }

  private request<T = unknown>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo actualizar la cola local.'));
    });
  }

  private newId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
