import { inject, Injectable } from '@angular/core';
import { concatMap, from, map, of, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { FeedManufacture, ManufactureCalculation, ManufactureRecipe, ManufactureRequest, PendingManufacture } from '../interfaces/feed-manufacture.interface';
import { PaginatedResponse } from '../interfaces/production-unit.interface';

@Injectable({ providedIn: 'root' })
export class FeedManufactureService {
  private readonly api = inject(ApiClient);
  private readonly pending = new Map<string, PendingManufacture>();

  // Only an operation's non-secret request/key is retained, scoped to actor/session/plant.
  readPending(owner: string, plant: number): PendingManufacture | null {
    const storageKey = this.storageKey(owner, plant);
    const remembered = this.pending.get(storageKey);
    if (remembered) return remembered;
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (!raw || typeof raw !== 'object' || !('key' in raw) || typeof raw.key !== 'string'
        || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(raw.key)
        || !('request' in raw) || !raw.request || typeof raw.request !== 'object') return null;
      const body = raw.request;
      if (!('planta_id' in body) || body.planta_id !== plant || !('receta_id' in body)
        || typeof body.receta_id !== 'number' || !Number.isSafeInteger(body.receta_id) || body.receta_id < 1
        || !('cantidad_g' in body) || typeof body.cantidad_g !== 'string'
        || !/^[1-9]\d{0,11}$/.test(body.cantidad_g)) return null;
      const pending = { key: raw.key, request: { planta_id: plant, receta_id: body.receta_id, cantidad_g: body.cantidad_g } };
      this.pending.set(storageKey, pending);
      return pending;
    } catch { return null; }
  }

  rememberPending(owner: string, pending: PendingManufacture): void {
    const key = this.storageKey(owner, pending.request.planta_id);
    this.pending.set(key, pending);
    try { sessionStorage.setItem(key, JSON.stringify(pending)); } catch { /* Memory fallback when storage is unavailable. */ }
  }

  forgetPending(owner: string, plant: number): void {
    const key = this.storageKey(owner, plant);
    this.pending.delete(key);
    try { sessionStorage.removeItem(key); } catch { /* Storage can be disabled by the browser. */ }
  }

  private storageKey(owner: string, plant: number): string {
    return `gam.feed-manufacture.pending.v1:${owner}:${plant}`;
  }

  recipes() {
    const page = (number: number) => this.api.get<PaginatedResponse<ManufactureRecipe>>('recetas', {
      params: { estado: 'active', por_pagina: 100, page: number },
    });
    return page(1).pipe(concatMap((first) => {
      if (first.meta.last_page <= 1) return of(first.data);
      return from(Array.from({ length: first.meta.last_page - 1 }, (_, index) => index + 2)).pipe(
        concatMap(page), map((response) => response.data), toArray(),
        map((remaining) => [first.data, ...remaining].flat()),
      );
    }));
  }

  calculate(recipe: number, grams: string) {
    return this.api.post<{ data: ManufactureCalculation }>(`recetas/${recipe}/calculo`, { cantidad_g: grams })
      .pipe(map((response) => response.data));
  }

  manufacture(request: ManufactureRequest, key: string) {
    return this.api.post<{ data: FeedManufacture }>('elaboraciones', request, {
      headers: { 'Idempotency-Key': key },
    }).pipe(map((response) => response.data));
  }
}
