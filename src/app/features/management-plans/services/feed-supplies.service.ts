import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { FeedSupply, FeedSupplyInput } from '../interfaces/feed-supply';
import { PlanPage } from '../interfaces/management-plan';

@Injectable({ providedIn: 'root' })
export class FeedSuppliesService {
  private readonly api = inject(ApiClient);
  list(flock: string, page = 1): Observable<PlanPage<FeedSupply>> { return this.api.get('flocks/' + encodeURIComponent(flock) + '/alimentacion', { params: { page, per_page: 20 } }); }
  products(search = '', page = 1): Observable<{ data: { id: number; name: string }[]; meta: { current_page: number; last_page: number } }> {
    return this.api.get('alimentacion/productos', { params: { search: search || undefined, page } });
  }
  record(flock: string, data: FeedSupplyInput, key: string): Observable<unknown> {
    return this.api.post('flocks/' + encodeURIComponent(flock) + '/alimentacion', data, { headers: { 'Idempotency-Key': key } });
  }
  cancel(flock: string, id: string, reason: string, key: string): Observable<unknown> {
    return this.api.post('flocks/' + encodeURIComponent(flock) + '/alimentacion/' + encodeURIComponent(id) + '/anulacion', { reason }, { headers: { 'Idempotency-Key': key } });
  }
}
