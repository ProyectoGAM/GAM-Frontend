import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { FeedAdjustmentResult, PendingFeedAdjustment } from '../interfaces/feed-adjustment.interface';

@Injectable({ providedIn: 'root' })
export class FeedAdjustmentService {
  private readonly api = inject(ApiClient);
  private readonly pending = new Map<string, PendingFeedAdjustment>();

  adjust(plant: number, pending: PendingFeedAdjustment) {
    return this.api.post<{ data: FeedAdjustmentResult }>(
      `plantas-racion/${plant}/ingredientes/${pending.productId}/ajustes`, pending.request,
      { headers: { 'Idempotency-Key': pending.key } },
    ).pipe(map((response) => response.data));
  }

  readPending(owner: string, plant: number): PendingFeedAdjustment | null {
    const key = this.storageKey(owner, plant);
    const remembered = this.pending.get(key);
    if (remembered) return remembered;
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (!raw || typeof raw !== 'object' || !('key' in raw) || typeof raw.key !== 'string'
        || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(raw.key)
        || !('productId' in raw) || typeof raw.productId !== 'number' || !Number.isSafeInteger(raw.productId) || raw.productId < 1
        || !('request' in raw) || !raw.request || typeof raw.request !== 'object') return null;
      const body = raw.request;
      if (!('accion' in body) || (body.accion !== 'sumar' && body.accion !== 'restar' && body.accion !== 'establecer')
        || !('valor_g' in body) || typeof body.valor_g !== 'string' || !/^\d{1,12}$/.test(body.valor_g)
        || (body.accion !== 'establecer' && BigInt(body.valor_g) === 0n)
        || !('motivo' in body) || typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 2000) return null;
      const pending: PendingFeedAdjustment = { key: raw.key, productId: raw.productId,
        request: { accion: body.accion, valor_g: body.valor_g, motivo: body.motivo } };
      this.pending.set(key, pending);
      return pending;
    } catch { return null; }
  }

  rememberPending(owner: string, plant: number, pending: PendingFeedAdjustment): void {
    const key = this.storageKey(owner, plant);
    this.pending.set(key, pending);
    // Non-secret operation data only; isolate retries by actor/session and plant.
    try { sessionStorage.setItem(key, JSON.stringify(pending)); } catch { /* Memory fallback. */ }
  }

  forgetPending(owner: string, plant: number): void {
    const key = this.storageKey(owner, plant);
    this.pending.delete(key);
    try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
  }

  private storageKey(owner: string, plant: number): string {
    return `gam.feed-adjustment.pending.v1:${owner}:${plant}`;
  }
}
