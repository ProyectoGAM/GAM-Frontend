import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiClient } from '../../../core/api/api-client';
import { healthEntry } from '../testing/health-fixtures';
import { FlockHealthService } from './flock-health.service';

describe('FlockHealthService', () => {
  it('fetches all health streams and pages, including compensatory corrections', async () => {
    const get = vi.fn((_path: string, options: { params: { type: string; page: number } }) => of({
      data: options.params.type === 'vaccination' ? [{ ...healthEntry, id: 'entry-' + options.params.page }] : [],
      meta: { current_page: options.params.page, last_page: options.params.type === 'vaccination' ? 2 : 1 },
    }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });
    const rows = await firstValueFrom(TestBed.inject(FlockHealthService).history('lot/1'));
    expect(rows).toHaveLength(2);
    expect(get).toHaveBeenCalledWith('flocks/lot%2F1/manejos', { params: { type: 'vaccination', page: 2, per_page: 100 } });
    expect(get).toHaveBeenCalledWith('flocks/lot%2F1/manejos', { params: { type: 'management_correction', page: 1, per_page: 100 } });
  });
  it('fails rather than returning an apparently complete partial history', async () => {
    const get = vi.fn((_path: string, options: { params: { type: string } }) => options.params.type === 'medication' ? throwError(() => new Error('offline'))
      : of({ data: [healthEntry], meta: { current_page: 1, last_page: 1 } }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });
    await expect(firstValueFrom(TestBed.inject(FlockHealthService).history('lot'))).rejects.toThrow('offline');
  });
  it('posts medication without quantity, preserving the request and idempotency key', async () => {
    const post = vi.fn(() => of({ data: { operation_id: 'op-1', medicine_application: { id: 'app-1' } } }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { post } }] });
    const body = { medicine_id: 'medicine-1', occurred_at: '2026-10-20T09:00:00-03:00', reason: 'Indicación' };
    await firstValueFrom(TestBed.inject(FlockHealthService).record('lot/1', { kind: 'medication', body }, 'key-1'));
    expect(post).toHaveBeenCalledExactlyOnceWith('flocks/lot%2F1/medicaciones', body, { headers: { 'Idempotency-Key': 'key-1' } });
    expect(body).not.toHaveProperty('quantity');
  });
  it('does not treat a malformed successful response as a confirmed application', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { post: () => of({ data: {} }) } }] });
    await expect(firstValueFrom(TestBed.inject(FlockHealthService).record('lot', {
      kind: 'vaccination', body: { vaccine_id: 'vaccine-1', occurred_at: '2026-10-20T09:00:00-03:00' },
    }, 'key'))).rejects.toThrow('Invalid health application response');
  });
});
