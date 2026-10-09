import { Injectable, inject } from '@angular/core';
import { concatMap, forkJoin, from, map, Observable, of, switchMap, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { EggHistorySummary, EggMetrics, FlockLatestWeighing } from '../interfaces/flock-detail.interface';
import { DailyWeighingPage } from '../interfaces/flock-weighing.interface';
import { Flock } from '../interfaces/flock.interface';

interface Envelope<T> { data: T }
interface Page<T> { data: T[]; meta: { last_page: number } }
interface MortalityRecord { quantity: number; status: 'recorded' | 'cancelled' }

const LOTS_TIMEZONE = 'America/Montevideo';
const DAY_MS = 86_400_000;

export function todayInLotsTimezone(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LOTS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function dateBefore(date: string, days: number): string {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return new Date(timestamp - days * DAY_MS).toISOString().slice(0, 10);
}

export function splitMetricsPeriods(fromDate: string, toDate: string): Array<{ from: string; to: string }> {
  const periods: Array<{ from: string; to: string }> = [];
  const last = Date.parse(`${toDate}T00:00:00Z`);
  let start = Date.parse(`${fromDate}T00:00:00Z`);
  while (start <= last) {
    const end = Math.min(start + 365 * DAY_MS, last);
    periods.push({
      from: new Date(start).toISOString().slice(0, 10),
      to: new Date(end).toISOString().slice(0, 10),
    });
    start = end + DAY_MS;
  }
  return periods;
}

@Injectable({ providedIn: 'root' })
export class FlockDetailService {
  private readonly api = inject(ApiClient);

  flock(id: string): Observable<Flock> {
    return this.api.get<Envelope<Flock>>(`flocks/${encodeURIComponent(id)}`).pipe(map((response) => response.data));
  }

  mortalityTotal(id: string): Observable<number> {
    const page = (number: number) => this.api.get<Page<MortalityRecord>>(
      `flocks/${encodeURIComponent(id)}/mortalities`,
      { params: { status: 'recorded', page: number, per_page: 100 } },
    );
    return page(1).pipe(
      switchMap((first) => {
        if (first.meta.last_page <= 1) return of(first.data);
        return from(Array.from({ length: first.meta.last_page - 1 }, (_, index) => index + 2)).pipe(
          concatMap((number) => page(number)),
          map((response) => response.data),
          toArray(),
          map((remaining) => [first.data, ...remaining].flat()),
        );
      }),
      map((records) => records.reduce((total, record) => total + record.quantity, 0)),
    );
  }

  latestWeighing(id: string): Observable<FlockLatestWeighing | null> {
    const findLatest = (cursor: string | null): Observable<FlockLatestWeighing | null> =>
      this.api.get<DailyWeighingPage>('pesajes-diarios', {
        params: { flock_id: id, cursor, per_page: 20 },
      }).pipe(switchMap((response) => {
        const daily = response.data.find((item) => item.represented_bird_count > 0 && item.average_weight_g !== null);
        if (daily && daily.average_weight_g !== null) {
          return of({ date: daily.date, average_weight_g: daily.average_weight_g });
        }
        return response.next_cursor ? findLatest(response.next_cursor) : of(null);
      }));
    return findLatest(null);
  }

  eggAverageLastSevenDays(id: string, today: string): Observable<number | null> {
    return this.eggMetrics(id, dateBefore(today, 6), today).pipe(
      map((metrics) => metrics.by_day.length ? metrics.daily_average : null),
    );
  }

  eggHistory(id: string, entryDate: string, today: string): Observable<EggHistorySummary> {
    const periods = splitMetricsPeriods(entryDate, today);
    if (!periods.length) return of({ total: 0, latestDay: null });
    return forkJoin(periods.map((period) => this.eggMetrics(id, period.from, period.to))).pipe(
      map((metrics) => ({
        total: metrics.reduce((total, item) => total + item.total_eggs, 0),
        latestDay: metrics.reduce<EggHistorySummary['latestDay']>((latest, item) => {
          const day = item.by_day.at(-1);
          return day && (!latest || day.date > latest.date) ? day : latest;
        }, null),
      })),
    );
  }

  private eggMetrics(id: string, fromDate: string, toDate: string): Observable<EggMetrics> {
    return this.api.get<Envelope<EggMetrics>>(`flocks/${encodeURIComponent(id)}/metrics`, {
      params: { date_from: fromDate, date_to: toDate },
    }).pipe(map((response) => response.data));
  }
}
