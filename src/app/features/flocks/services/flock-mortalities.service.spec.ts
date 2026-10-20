import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiClient } from '../../../core/api/api-client';
import { FlockMortalitiesService } from './flock-mortalities.service';

describe('FlockMortalitiesService', () => {
  it('cancels through the audited endpoint with both versions, reason and idempotency header', async () => {
    const response = { operation_id: 'undo-operation', mortality: { id: 'record/1', status: 'cancelled' } };
    const post = vi.fn(() => of({ data: response }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { post } }] });
    const request = { version: 2, flock_version: 5, reason: 'Registro duplicado', confirm_reactivation: true };
    expect(await firstValueFrom(TestBed.inject(FlockMortalitiesService).cancel('record/1', request, 'undo-key'))).toEqual(response);
    expect(post).toHaveBeenCalledExactlyOnceWith('mortalities/record%2F1/cancellation', request,
      { headers: { 'Idempotency-Key': 'undo-key' } });
  });
  it('records a mandatory text reason with the flock version, zoned timestamp and idempotency header', async () => {
    const response = { operation_id: 'operation', mortality: { id: 'new-record', quantity: 3 } };
    const post = vi.fn(() => of({ data: response }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { post } }] });
    const payload = { version: 4, quantity: 3, occurred_at: '2026-10-12T12:30:00-03:00', notes: 'Golpe de calor' };
    expect(await firstValueFrom(TestBed.inject(FlockMortalitiesService).record('lot/1', payload, 'key'))).toEqual(response);
    expect(post).toHaveBeenCalledExactlyOnceWith('flocks/lot%2F1/mortalities', payload, { headers: { 'Idempotency-Key': 'key' } });
    expect(payload).not.toHaveProperty('mortality_category_id');
  });
  it('loads all active-record pages before presenting totals and reasons', async () => {
    const get = vi.fn((_path: string, options: { params: { page: number } }) => of({
      data: [{ id: `record-${options.params.page}` }], meta: { last_page: 3 },
    }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });
    const records = await firstValueFrom(TestBed.inject(FlockMortalitiesService).list('lote/1'));
    expect(records.map((record) => record.id)).toEqual(['record-1', 'record-2', 'record-3']);
    expect(get).toHaveBeenLastCalledWith('flocks/lote%2F1/mortalities', {
      params: { status: 'recorded', page: 3, per_page: 100 },
    });
  });

  it('preserves API failures rather than displaying incomplete history as a successful total', async () => {
    const error = new HttpErrorResponse({ status: 403 });
    const get = vi.fn((_path: string, options: { params: { page: number } }) => options.params.page === 1
      ? of({ data: [{ id: 'partial' }], meta: { last_page: 2 } }) : throwError(() => error));
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { get } }] });
    await expect(firstValueFrom(TestBed.inject(FlockMortalitiesService).list('lot'))).rejects.toBe(error);
  });
});
