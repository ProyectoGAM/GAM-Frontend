import { Injectable, inject } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { VehicleFuelInput } from '../vehicles/interfaces/vehicle';
import { AddDeliveryLoadInput, CloseDeliveryInput, Delivery, DeliveryClient, DeliveryPaymentInput, DeliveryUnit, DeliveryProductionUnit, LocationInput, StopInput } from './delivery.models';

export type DeliveryOutboxKind = 'load' | 'stop' | 'payment' | 'fuel' | 'locations' | 'close';
export interface DeliveryOutboxEntry {
  id: string;
  actorId?: number;
  schemaVersion?: number;
  order?: number;
  state?: 'pending' | 'needs_review' | 'superseded';
  error?: string;
  replaces?: string;
  kind: DeliveryOutboxKind;
  deliveryId: string;
  payload: AddDeliveryLoadInput | StopInput | DeliveryPaymentInput | VehicleFuelInput | { locations: LocationInput[] } | Omit<CloseDeliveryInput, 'pin'>;
  idempotencyKey: string | null;
  createdAt: string;
  attempts: number;
}
export interface DeliveryReferenceCache {
  actorId: number;
  units: readonly DeliveryUnit[];
  productionUnits: readonly DeliveryProductionUnit[];
  clients?: readonly DeliveryClient[];
  delivery: Delivery | null;
}
type NewEntry = Pick<DeliveryOutboxEntry, 'kind' | 'deliveryId' | 'payload' | 'idempotencyKey'>;
const REFERENCE_STORE = 'references';
const STORE_NAME = 'outbox';

@Injectable({ providedIn: 'root' })
export class DeliveryOutboxService {
  private readonly auth = inject(AuthStore);
  private databasePromise: Promise<IDBDatabase> | null = null;

  /** Espera el commit durable antes de permitir enviar dinero o modificar la vista. */
  async enqueue(entry: NewEntry, replacing?: DeliveryOutboxEntry): Promise<DeliveryOutboxEntry> {
    const actorId = this.actorId();
    const database = await this.database();
    this.assertActor(actorId);
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const committed = this.committed(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const value: DeliveryOutboxEntry = { ...entry, id: crypto.randomUUID(), actorId, schemaVersion: 4, state: 'pending', createdAt: new Date().toISOString(), attempts: 0 };
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = request.result as DeliveryOutboxEntry[];
      if (replacing) {
        const original = rows.find((row) => row.id === replacing.id && row.actorId === actorId && row.state === 'needs_review');
        if (!original || original.deliveryId !== entry.deliveryId || original.kind !== entry.kind) { transaction.abort(); return; }
        store.put({ ...original, state: 'superseded' });
        value.order = original.order ?? 0;
        value.replaces = original.id;
      } else value.order = rows.reduce((max, row) => row.actorId === actorId ? Math.max(max, row.order ?? 0) : max, 0) + 1;
      store.add(value);
    };
    await committed;
    this.assertActor(actorId);
    return value;
  }

  async list(deliveryId?: string): Promise<DeliveryOutboxEntry[]> {
    const actorId = this.actorId();
    const database = await this.database();
    const rows = await this.request<DeliveryOutboxEntry[]>(database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll());
    this.assertActor(actorId);
    return rows.filter((row) => row.actorId === actorId && row.state !== 'superseded' && (!deliveryId || row.deliveryId === deliveryId))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
  }

  /** Sólo una respuesta autenticada del servidor permite atribuir eventos anteriores sin actor. */
  async claimLegacy(delivery: Delivery): Promise<void> {
    const actorId = this.actorId();
    if (delivery.driver?.id !== actorId) throw new Error('El reparto no pertenece a la sesión actual.');
    const database = await this.database();
    this.assertActor(actorId);
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const committed = this.committed(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index('deliveryId').getAll(delivery.id);
    request.onsuccess = () => {
      const rows = (request.result as DeliveryOutboxEntry[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      rows.forEach((row, index) => {
        if (!row.actorId) store.put({ ...row, actorId, order: index - rows.length, state: row.kind === 'close' ? 'needs_review' : 'pending', error: row.kind === 'close' ? 'Confirmá el cierre con tu PIN en línea.' : undefined });
      });
    };
    await committed;
  }

  async remove(id: string): Promise<void> { await this.mutate(id, () => null); }
  async reject(entry: DeliveryOutboxEntry, error: string): Promise<void> {
    await this.mutate(entry.id, (value) => ({ ...value, state: 'needs_review', error, attempts: value.attempts + 1 }));
  }
  async retry(entry: DeliveryOutboxEntry): Promise<void> { await this.mutate(entry.id, (value) => ({ ...value, state: 'pending', error: undefined })); }
  async count(deliveryId: string): Promise<number> { return (await this.list(deliveryId)).length; }

  async saveReferences(cache: DeliveryReferenceCache): Promise<void> {
    this.assertActor(cache.actorId);
    const database = await this.database();
    this.assertActor(cache.actorId);
    const transaction = database.transaction(REFERENCE_STORE, 'readwrite');
    const committed = this.committed(transaction);
    transaction.objectStore(REFERENCE_STORE).put(cache);
    await committed;
  }
  async referencesFor(actorId: number): Promise<DeliveryReferenceCache | null> {
    this.assertActor(actorId);
    const database = await this.database();
    const cache = await this.request<DeliveryReferenceCache | undefined>(database.transaction(REFERENCE_STORE).objectStore(REFERENCE_STORE).get(actorId));
    this.assertActor(actorId);
    return cache ?? null;
  }

  private async mutate(id: string, change: (entry: DeliveryOutboxEntry) => DeliveryOutboxEntry | null): Promise<void> {
    const actorId = this.actorId();
    const database = await this.database();
    this.assertActor(actorId);
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const committed = this.committed(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const entry = request.result as DeliveryOutboxEntry | undefined;
      if (entry?.actorId !== actorId) { transaction.abort(); return; }
      const result = change(entry);
      if (result) store.put(result); else store.delete(id);
    };
    await committed;
  }
  private actorId(): number {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Iniciá sesión para consultar los pendientes.');
    return id;
  }
  private assertActor(id: number): void { if (this.actorId() !== id) throw new Error('La sesión cambió. Volvé a abrir el reparto.'); }
  private database(): Promise<IDBDatabase> {
    if (typeof globalThis.indexedDB === 'undefined') return Promise.reject(new Error('No hay almacenamiento durable disponible. No se guardó la operación.'));
    return this.databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('gam-deliveries', 4);
      request.onerror = () => { this.databasePromise = null; reject(request.error ?? new Error('No se pudo abrir la cola local.')); };
      request.onblocked = () => { this.databasePromise = null; reject(new Error('Cerrá otras pestañas de GAM para actualizar el almacenamiento local.')); };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.databasePromise = null; }; resolve(request.result); };
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('deliveryId', 'deliveryId');
          store.createIndex('createdAt', 'createdAt');
        }
        if (!request.result.objectStoreNames.contains(REFERENCE_STORE)) request.result.createObjectStore(REFERENCE_STORE, { keyPath: 'actorId' });
      };
    });
  }
  private committed(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo confirmar el almacenamiento local. No se enviará la operación.'));
    });
  }
  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
}
