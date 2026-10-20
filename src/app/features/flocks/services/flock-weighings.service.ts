import { Injectable, inject } from '@angular/core';
import { map, Observable, of, switchMap, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  AddDailyWeighingEntry, DailyWeighingDetail, DailyWeighingOperation, DailyWeighingPage,
  DeleteDailyWeighingEntry, SaveWeighingSettingsRequest, WeighingSettings,
  BreedWeighingSettings, SaveBreedWeighingSettings,
} from '../interfaces/flock-weighing.interface';

interface Envelope<T> { data: T }

@Injectable({ providedIn: 'root' })
export class FlockWeighingsService {
  private readonly api = inject(ApiClient);

  listDaily(flockId: string, cursor: string | null = null): Observable<DailyWeighingPage> {
    return this.api.get<DailyWeighingPage>('pesajes-diarios', {
      params: { flock_id: flockId, cursor, per_page: 20 },
    });
  }

  dailyEvolution(flockId: string, from: string | null, to: string): Observable<DailyWeighingPage['data']> {
    const page = (cursor: string | null): Observable<DailyWeighingPage['data']> =>
      this.api.get<DailyWeighingPage>('pesajes-diarios', {
        params: { flock_id: flockId, date_from: from, date_to: to, cursor, per_page: 100 },
      }).pipe(switchMap((response) => response.next_cursor
        ? page(response.next_cursor).pipe(map((remaining) => [...response.data, ...remaining]))
        : of(response.data)));
    return page(null);
  }

  getDaily(id: string, cursor: string | null = null, perPage = 100): Observable<DailyWeighingDetail> {
    return this.api.get<Envelope<DailyWeighingDetail>>(`pesajes-diarios/${encodeURIComponent(id)}`, {
      params: { cursor, per_page: perPage },
    }).pipe(map((response) => response.data));
  }

  getDailyByDate(flockId: string, date: string, cursor: string | null = null): Observable<DailyWeighingDetail> {
    return this.api.get<Envelope<DailyWeighingDetail>>(
      `lotes/${encodeURIComponent(flockId)}/pesajes-diarios/${encodeURIComponent(date)}`,
      { params: { cursor, per_page: 50 } },
    ).pipe(map((response) => response.data));
  }

  addDailyEntry(flockId: string, payload: AddDailyWeighingEntry, idempotencyKey: string): Observable<DailyWeighingOperation> {
    return this.api.post<Envelope<DailyWeighingOperation>>(
      `lotes/${encodeURIComponent(flockId)}/pesajes-diarios/ingresos`, payload,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ).pipe(map((response) => response.data));
  }

  deleteDailyEntry(id: string, entryId: string, payload: DeleteDailyWeighingEntry,
    idempotencyKey: string): Observable<DailyWeighingOperation> {
    return this.api.delete<Envelope<DailyWeighingOperation>>(
      `pesajes-diarios/${encodeURIComponent(id)}/ingresos/${encodeURIComponent(entryId)}`,
      { body: payload, headers: { 'Idempotency-Key': idempotencyKey } },
    ).pipe(map((response) => response.data));
  }

  settings(): Observable<WeighingSettings | null> {
    return this.api.get<Envelope<WeighingSettings | null>>('configuracion-pesajes')
      .pipe(map((response) => response.data));
  }

  breedSettings(id: number, page = 1): Observable<BreedWeighingSettings> {
    return this.api.get<{ data: BreedWeighingSettings[]; meta: { last_page: number } }>('breeds', {
      params: { page, per_page: 100 },
    }).pipe(switchMap((response) => {
      const breed = response.data.find((candidate) => candidate.id === id);
      if (breed) return of(breed);
      return page < response.meta.last_page ? this.breedSettings(id, page + 1)
        : throwError(() => new Error('Raza no disponible'));
    }));
  }

  saveBreedSettings(id: number, payload: SaveBreedWeighingSettings, idempotencyKey: string): Observable<unknown> {
    return this.api.patch<unknown>(`breeds/${encodeURIComponent(id)}`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  saveSettings(payload: SaveWeighingSettingsRequest, idempotencyKey: string): Observable<unknown> {
    return this.api.put<unknown>('configuracion-pesajes', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }
}
