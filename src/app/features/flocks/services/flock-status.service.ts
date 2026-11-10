import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { FlockFinalizationRequest, FlockStatusRequest, FlockStatusResult } from '../interfaces/flock-status.interface';

@Injectable({ providedIn: 'root' })
export class FlockStatusService {
  private readonly api = inject(ApiClient);

  change(id: string, body: FlockStatusRequest, key: string): Observable<FlockStatusResult> {
    return this.api.patch<{ data: FlockStatusResult }, FlockStatusRequest>(
      `flocks/${encodeURIComponent(id)}/status`, body, { headers: { 'Idempotency-Key': key } },
    ).pipe(map((response) => response.data));
  }

  finalize(id: string, body: FlockFinalizationRequest, key: string): Observable<FlockStatusResult> {
    return this.api.post<{ data: FlockStatusResult }, FlockFinalizationRequest>(
      `flocks/${encodeURIComponent(id)}/finalization`, body, { headers: { 'Idempotency-Key': key } },
    ).pipe(map((response) => response.data));
  }
}
