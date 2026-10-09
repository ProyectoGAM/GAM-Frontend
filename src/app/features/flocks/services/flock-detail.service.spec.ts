import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ApiClient } from '../../../core/api/api-client';
import { FlockDetailService, splitMetricsPeriods, todayInLotsTimezone } from './flock-detail.service';

describe('FlockDetailService', () => {
  it('uses the latest daily sample average, including groups, rather than the last entry or legacy weighings', async () => {
    const get = vi.fn(() => of({ data: [
      { date: '2026-10-09', represented_bird_count: 12, average_weight_g: '97.5',
        last_entry: { mode: 'group', average_weight_g: '100' } },
      { date: '2026-10-08', represented_bird_count: 5, average_weight_g: '80' },
    ], next_cursor: 'older-days' }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    const latest = await firstValueFrom(TestBed.inject(FlockDetailService).latestWeighing('flock-1'));

    expect(latest).toEqual({ date: '2026-10-09', average_weight_g: '97.5' });
    expect(get).toHaveBeenCalledExactlyOnceWith('pesajes-diarios', {
      params: { flock_id: 'flock-1', cursor: null, per_page: 20 },
    });
  });

  it('skips days emptied by deletion and follows the cursor to the latest remaining sample', async () => {
    const get = vi.fn((_path: string, options: { params: { cursor: string | null } }) => of(
      options.params.cursor === null
        ? { data: [{ date: '2026-10-09', represented_bird_count: 0, average_weight_g: null }], next_cursor: 'older-days' }
        : { data: [{ date: '2026-10-08', represented_bird_count: 10, average_weight_g: '70' }], next_cursor: null },
    ));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    const latest = await firstValueFrom(TestBed.inject(FlockDetailService).latestWeighing('flock-1'));

    expect(latest).toEqual({ date: '2026-10-08', average_weight_g: '70' });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith('pesajes-diarios', {
      params: { flock_id: 'flock-1', cursor: 'older-days', per_page: 20 },
    });
  });

  it.each([
    { data: [] },
    { data: [{ date: '2026-10-09', represented_bird_count: 0, average_weight_g: null }] },
  ])(
    'returns no latest weighing when no active measurements remain: %j', async ({ data }) => {
      const get = vi.fn(() => of({ data, next_cursor: null }));
      TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

      expect(await firstValueFrom(TestBed.inject(FlockDetailService).latestWeighing('flock-1'))).toBeNull();
    },
  );

  it('preserves permission errors so the card reports unavailable rather than no records', async () => {
    const error = new HttpErrorResponse({ status: 403 });
    const get = vi.fn(() => throwError(() => error));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    await expect(firstValueFrom(TestBed.inject(FlockDetailService).latestWeighing('flock-1'))).rejects.toBe(error);
  });

  it('splits the full flock lifetime into inclusive periods accepted by the API', () => {
    expect(splitMetricsPeriods('2025-01-01', '2026-01-02')).toEqual([
      { from: '2025-01-01', to: '2026-01-01' },
      { from: '2026-01-02', to: '2026-01-02' },
    ]);
    expect(splitMetricsPeriods('2026-01-02', '2026-01-01')).toEqual([]);
    expect(todayInLotsTimezone(new Date('2026-10-07T02:00:00Z'))).toBe('2026-10-06');
  });

  it('adds every recorded mortality page and requests only active records', async () => {
    const get = vi.fn((_path: string, options: { params: { page: number } }) => of(options.params.page === 1
      ? { data: [{ quantity: 2 }, { quantity: 3 }], meta: { last_page: 2 } }
      : { data: [{ quantity: 4 }], meta: { last_page: 2 } }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    const total = await firstValueFrom(TestBed.inject(FlockDetailService).mortalityTotal('flock-1'));

    expect(total).toBe(9);
    expect(get).toHaveBeenCalledWith('flocks/flock-1/mortalities', {
      params: { status: 'recorded', page: 1, per_page: 100 },
    });
    expect(get).toHaveBeenCalledWith('flocks/flock-1/mortalities', {
      params: { status: 'recorded', page: 2, per_page: 100 },
    });
  });

  it('sums egg metrics across years and uses the latest day total', async () => {
    const get = vi.fn((_path: string, options: { params: { date_from: string } }) => of({ data: options.params.date_from === '2025-01-01'
      ? { total_eggs: 800, daily_average: 0, by_day: [{ date: '2025-12-31', quantity: 6 }] }
      : { total_eggs: 200, daily_average: 0, by_day: [{ date: '2026-01-02', quantity: 10 }] } }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    const summary = await firstValueFrom(TestBed.inject(FlockDetailService)
      .eggHistory('flock-1', '2025-01-01', '2026-01-02'));

    expect(summary).toEqual({ total: 1000, latestDay: { date: '2026-01-02', quantity: 10 } });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('labels a seven-day period without records as empty', async () => {
    const get = vi.fn(() => of({ data: { total_eggs: 0, daily_average: 0, by_day: [] } }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });

    const average = await firstValueFrom(TestBed.inject(FlockDetailService)
      .eggAverageLastSevenDays('flock-1', '2026-10-07'));

    expect(average).toBeNull();
    expect(get).toHaveBeenCalledWith('flocks/flock-1/metrics', {
      params: { date_from: '2026-10-01', date_to: '2026-10-07' },
    });
  });
});
