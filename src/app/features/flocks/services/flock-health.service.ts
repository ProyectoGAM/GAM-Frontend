import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, forkJoin, map, reduce } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { HealthApplicationDraft, HealthHistoryEntry, HealthHistoryPage, HealthOperation } from '../interfaces/flock-health.interface';
import { healthHistoryRows } from './flock-health';

@Injectable({ providedIn: 'root' })
export class FlockHealthService {
  private readonly api = inject(ApiClient);

  history(id: string) {
    const stream = (type: string): Observable<HealthHistoryEntry[]> => {
      const page = (number: number) => this.api.get<HealthHistoryPage>(`flocks/${encodeURIComponent(id)}/manejos`, {
        params: { type, page: number, per_page: 100 },
      });
      return page(1).pipe(
        expand((response) => response.meta.current_page < response.meta.last_page ? page(response.meta.current_page + 1) : EMPTY),
        reduce((all, response) => [...all, ...response.data], [] as HealthHistoryEntry[]),
      );
    };
    return forkJoin([stream('vaccination'), stream('medication'), stream('management_correction')])
      .pipe(map((streams) => healthHistoryRows(streams.flat())));
  }

  record(id: string, request: HealthApplicationDraft, key: string): Observable<HealthOperation> {
    const endpoint = request.kind === 'vaccination' ? 'vacunaciones' : 'medicaciones';
    return this.api.post<{ data: HealthOperation }>(`flocks/${encodeURIComponent(id)}/${endpoint}`, request.body, {
      headers: { 'Idempotency-Key': key },
    }).pipe(map((response) => {
      const application = request.kind === 'vaccination' ? response.data?.vaccination_application : response.data?.medicine_application;
      if (!response.data?.operation_id || !application?.id) throw new Error('Invalid health application response');
      return response.data;
    }));
  }
}
