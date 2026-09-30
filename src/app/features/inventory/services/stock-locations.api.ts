import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  ApiEnvelope,
  PaginatedResponse,
  StockLocation,
  StockLocationFilters,
  StockLocationStatus,
} from '../interfaces/inventory';

@Injectable({ providedIn: 'root' })
export class StockLocationsApi {
  private readonly api = inject(ApiClient);

  list(filters: StockLocationFilters): Observable<PaginatedResponse<StockLocation>> {
    return this.api.get<PaginatedResponse<StockLocation>>('stock-locations', { params: { ...filters } });
  }

  create(body: { name: string; production_unit_id: number | null }): Observable<ApiEnvelope<StockLocation>> {
    return this.api.post<ApiEnvelope<StockLocation>, typeof body>('stock-locations', body);
  }

  update(id: number, body: { name?: string; production_unit_id?: number | null }): Observable<ApiEnvelope<StockLocation>> {
    return this.api.patch<ApiEnvelope<StockLocation>, typeof body>(`stock-locations/${id}`, body);
  }

  setStatus(id: number, status: StockLocationStatus): Observable<ApiEnvelope<StockLocation>> {
    return this.api.patch<ApiEnvelope<StockLocation>, { status: StockLocationStatus }>(
      `stock-locations/${id}/status`, { status },
    );
  }
}
