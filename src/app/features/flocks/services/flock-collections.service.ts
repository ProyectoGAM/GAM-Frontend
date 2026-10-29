import { Injectable, inject } from '@angular/core';
import { Observable, concatMap, from, map, of, toArray } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { CollectionOperation, CollectionPage, CollectionSummary, RecordCollectionRequest } from '../interfaces/flock-collection.interface';
import { EggMetricDay, EggMetrics } from '../interfaces/flock-detail.interface';
import { collectionSummary } from './collection-summary';
import { splitMetricsPeriods } from './flock-detail.service';

@Injectable({ providedIn: 'root' })
export class FlockCollectionsService {
  private readonly api = inject(ApiClient);

  history(flockId: string, page = 1): Observable<CollectionPage> {
    return this.api.get<CollectionPage>(`flocks/${encodeURIComponent(flockId)}/collections`, { params: { page, per_page: 20 } });
  }

  days(flockId: string, entryDate: string, today: string): Observable<EggMetricDay[]> {
    const periods = splitMetricsPeriods(entryDate, today);
    if (!periods.length) return of([]);
    return from(periods).pipe(
      concatMap((period) => this.api.get<{ data: EggMetrics }>(`flocks/${encodeURIComponent(flockId)}/metrics`,
        { params: { date_from: period.from, date_to: period.to } })),
      map((response) => response.data.by_day), toArray(), map((days) => days.flat()),
    );
  }

  summary(flockId: string, entryDate: string, today: string): Observable<CollectionSummary> {
    return this.days(flockId, entryDate, today).pipe(map((days) => collectionSummary(days, entryDate, today)));
  }

  record(flockId: string, request: RecordCollectionRequest, key: string): Observable<CollectionOperation> {
    return this.api.post<{ data: CollectionOperation }, RecordCollectionRequest>(`flocks/${encodeURIComponent(flockId)}/collections`,
      request, { headers: { 'Idempotency-Key': key } }).pipe(map((response) => response.data));
  }
}
