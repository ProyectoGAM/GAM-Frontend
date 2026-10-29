import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, forkJoin, from, map, of, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { FeedBalance, FeedConsumption, FeedCorrectionInput, FeedingChange, FeedingPage, FlockFeeding, FlockFeedingOverview, ManualFeedingInput } from '../interfaces/flock-feeding.interface';
import { nextFeedingChange, snapshotRecipeName } from './feeding-summary';
import { todayInLotsTimezone } from './flock-detail.service';

@Injectable({ providedIn: 'root' })
export class FlockFeedingService {
  private readonly api = inject(ApiClient);

  current(flock: string): Observable<FlockFeeding> {
    return this.api.get<{ data: FlockFeeding }>(`${this.path(flock)}/alimentacion`).pipe(map((response) => response.data));
  }

  overview(flock: string, unit: number): Observable<FlockFeedingOverview> {
    const today = todayInLotsTimezone();
    return this.current(flock).pipe(concatMap((current) => forkJoin({
      changes: this.latestChanges(flock).pipe(catchError(() => of(null))),
      balances: this.balances(unit).pipe(catchError(() => of([] as FeedBalance[]))),
    }).pipe(map(({ changes, balances }) => {
      const configuration = changes?.find((change) => change.id === current.id);
      const stages = configuration?.etapas_copiadas ?? [];
      const recipeName = balances.find((balance) => balance.up_id === unit && balance.receta_id === current.receta_id)?.nombre_receta
        ?? snapshotRecipeName(current.etapa, current.receta_id)
        ?? stages.map((stage) => snapshotRecipeName(stage, current.receta_id)).find((name) => name !== null)
        ?? `Receta #${current.receta_id}`;
      return { current, recipeName, scheduleAvailable: configuration !== undefined,
        nextChange: configuration ? nextFeedingChange(current, stages, today) : null };
    }))));
  }

  consumptions(flock: string): Observable<FeedConsumption[]> {
    return this.allPages<FeedConsumption>(`${this.path(flock)}/consumos-alimento`);
  }

  latestChanges(flock: string): Observable<FeedingChange[]> {
    return this.api.get<FeedingPage<FeedingChange>>(`${this.path(flock)}/alimentacion/historial`, {
      params: { por_pagina: 100 },
    }).pipe(map((response) => response.data));
  }

  balances(unit: number): Observable<FeedBalance[]> {
    return this.allPages<FeedBalance>('saldos-alimento', { up_id: unit });
  }

  change(flock: string, request: ManualFeedingInput, key: string): Observable<unknown> {
    return this.api.post(`${this.path(flock)}/alimentacion/manual`, request, { headers: { 'Idempotency-Key': key } });
  }

  automatic(flock: string, key: string): Observable<unknown> {
    return this.api.post(`${this.path(flock)}/alimentacion/automatico`, {}, { headers: { 'Idempotency-Key': key } });
  }

  correct(flock: string, consumption: number, request: FeedCorrectionInput, key: string): Observable<unknown> {
    return this.api.post(`${this.path(flock)}/consumos-alimento/${consumption}/rectificaciones`, request, {
      headers: { 'Idempotency-Key': key },
    });
  }

  private path(flock: string): string { return `lotes/${encodeURIComponent(flock)}`; }

  private allPages<T>(path: string, filters: Record<string, string | number> = {}): Observable<T[]> {
    const page = (number: number) => this.api.get<FeedingPage<T>>(path, { params: { ...filters, por_pagina: 100, page: number } });
    return page(1).pipe(concatMap((first) => {
      if (first.meta.last_page <= 1) return of(first.data);
      return from(Array.from({ length: first.meta.last_page - 1 }, (_, index) => index + 2)).pipe(
        concatMap((number) => page(number)), map((response) => response.data), toArray(),
        map((remaining) => [first.data, ...remaining].flat()),
      );
    }));
  }
}
