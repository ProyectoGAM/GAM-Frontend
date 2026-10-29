import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { CancelMortalityRequest, FlockMortality, MortalityOperation, RecordMortalityRequest } from '../interfaces/flock-mortality.interface';

interface MortalityPage { data: FlockMortality[]; meta: { last_page: number } }

@Injectable({ providedIn: 'root' })
export class FlockMortalitiesService {
  private readonly api = inject(ApiClient);

  list(flockId: string): Observable<FlockMortality[]> {
    const page = (number: number): Observable<FlockMortality[]> => this.api.get<MortalityPage>(
      `flocks/${encodeURIComponent(flockId)}/mortalities`,
      { params: { status: 'recorded', page: number, per_page: 100 } },
    ).pipe(switchMap((response) => number < response.meta.last_page
      ? page(number + 1).pipe(map((remaining) => [...response.data, ...remaining])) : of(response.data)));
    return page(1);
  }

  record(flockId: string, request: RecordMortalityRequest, idempotencyKey: string): Observable<MortalityOperation> {
    return this.api.post<{ data: MortalityOperation }, RecordMortalityRequest>(
      `flocks/${encodeURIComponent(flockId)}/mortalities`, request,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ).pipe(map((response) => response.data));
  }

  cancel(recordId: string, request: CancelMortalityRequest, idempotencyKey: string): Observable<MortalityOperation> {
    return this.api.post<{ data: MortalityOperation }, CancelMortalityRequest>(
      `mortalities/${encodeURIComponent(recordId)}/cancellation`, request,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ).pipe(map((response) => response.data));
  }
}
