import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, forkJoin, map, reduce } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { BeakTrimmingCommand } from '../interfaces/flock-beak-trimming';
import { HealthApplicationDraft, HealthHistoryEntry, HealthHistoryPage, HealthOperation } from '../interfaces/flock-health.interface';
import { healthHistoryRows } from './flock-health';
import { beakTrimmingRows } from './flock-beak-trimming';

@Injectable({ providedIn: 'root' })
export class FlockHealthService {
  private readonly api = inject(ApiClient);

  history(id: string) {
    return this.historyEntries(id, ['vaccination', 'medication', 'management_correction']).pipe(map(healthHistoryRows));
  }

  beakTrimmingHistory(id: string) {
    return this.historyEntries(id, ['manual_practice', 'management_correction']).pipe(map(beakTrimmingRows));
  }

  saveBeakTrimming(id: string, command: BeakTrimmingCommand, key: string) {
    const flock = `flocks/${encodeURIComponent(id)}`;
    const path = command.kind === 'record' ? `${flock}/practicas`
      : `${flock}/manejos/manual_practice/${encodeURIComponent(command.id)}/correcciones`;
    return this.api.post<{ data: { operation_id: string } }>(path, command.body, {
      headers: { 'Idempotency-Key': key },
    }).pipe(map((response) => {
      if (!response.data?.operation_id) throw new Error('Invalid beak trimming response');
      return response.data;
    }));
  }

  private historyEntries(id: string, types: readonly string[]) {
    const stream = (type: string): Observable<HealthHistoryEntry[]> => {
      const page = (number: number) => this.api.get<HealthHistoryPage>(`flocks/${encodeURIComponent(id)}/manejos`, {
        params: { type, page: number, per_page: 100 },
      });
      return page(1).pipe(
        expand((response) => response.meta.current_page < response.meta.last_page ? page(response.meta.current_page + 1) : EMPTY),
        reduce((all, response) => [...all, ...response.data], [] as HealthHistoryEntry[]),
      );
    };
    return forkJoin(types.map(stream)).pipe(map((streams) => streams.flat()));
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
