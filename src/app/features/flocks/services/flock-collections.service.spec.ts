import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClient } from '../../../core/api/api-client';
import { FlockCollectionsService } from './flock-collections.service';

describe('FlockCollectionsService', () => {
  it('reads the current record and sends corrections and cancellations with version and header idempotency', async () => {
    const operation = { operation_id: 'op', collection: { id: 'collection' } };
    const get = vi.fn(() => of({ data: operation.collection }));
    const patch = vi.fn(() => of({ data: operation })); const post = vi.fn(() => of({ data: operation }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get, patch, post } }] });
    const service = TestBed.inject(FlockCollectionsService);
    await firstValueFrom(service.collection('record/id'));
    expect(get).toHaveBeenCalledWith('collections/record%2Fid');
    const correction = { version: 3, quantity: 30, notes: null, correction_reason: 'Corregir cantidad' };
    await firstValueFrom(service.correct('record/id', correction, 'same-key'));
    expect(patch).toHaveBeenCalledWith('collections/record%2Fid', correction, { headers: { 'Idempotency-Key': 'same-key' } });
    const cancellation = { version: 4, correction_reason: 'Registro duplicado' };
    await firstValueFrom(service.cancel('record/id', cancellation, 'other-key'));
    expect(post).toHaveBeenCalledWith('collections/record%2Fid/cancellation', cancellation, { headers: { 'Idempotency-Key': 'other-key' } });
  });

  it('requests paginated history independently of chart filters, including cancelled records', async () => {
    const get = vi.fn(() => of({ data: [], meta: { current_page: 2, last_page: 3, total: 45 } }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });
    await firstValueFrom(TestBed.inject(FlockCollectionsService).history('flock/id', 2));
    expect(get).toHaveBeenCalledExactlyOnceWith('flocks/flock%2Fid/collections', { params: { page: 2, per_page: 20 } });
  });

  it('splits long lifetime metrics into non-overlapping API windows of at most 366 days', async () => {
    const get = vi.fn((_path: string, options: { params: { date_from: string; date_to: string } }) => of({
      data: { by_day: [{ date: options.params.date_to, quantity: 10 }] },
    }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });
    const days = await firstValueFrom(TestBed.inject(FlockCollectionsService).days('flock', '2024-02-29', '2026-10-12'));
    expect(get).toHaveBeenCalledTimes(3);
    expect(days).toHaveLength(3);
    const calls = get.mock.calls.map((call) => call[1].params);
    expect(calls[0].date_from).toBe('2024-02-29');
    expect(calls.at(-1)?.date_to).toBe('2026-10-12');
    calls.forEach((period, index) => {
      expect((Date.parse(period.date_to) - Date.parse(period.date_from)) / 86400000 + 1).toBeLessThanOrEqual(366);
      if (index) expect(Date.parse(period.date_from) - Date.parse(calls[index - 1].date_to)).toBe(86400000);
    });
  });

  it('posts the exact payload and caller-supplied idempotency key', async () => {
    const operation = { operation_id: 'op', collection: { id: 'new' } };
    const post = vi.fn(() => of({ data: operation }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { post } }] });
    const request = { quantity: 420, notes: null };
    expect(await firstValueFrom(TestBed.inject(FlockCollectionsService).record('flock', request, 'key'))).toEqual(operation);
    expect(post).toHaveBeenCalledExactlyOnceWith('flocks/flock/collections', request, { headers: { 'Idempotency-Key': 'key' } });
  });
});
