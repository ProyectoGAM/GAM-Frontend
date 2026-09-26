import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  ApiEnvelope,
  EggBalance,
  EggStockCancellationInput,
  EggStockCorrectionInput,
  EggStockFilters,
  EggStockIssueInput,
  EggStockReceiptInput,
  EggStockTransaction,
  PaginatedResponse,
} from '../interfaces/inventory';

interface EggCommandResult {
  transaction: string;
  movement_id?: number;
}

@Injectable({ providedIn: 'root' })
export class EggStockApi {
  private readonly api = inject(ApiClient);

  balance(productionUnitId: number): Observable<ApiEnvelope<EggBalance>> {
    return this.api.get<ApiEnvelope<EggBalance>>(`production-units/${productionUnitId}/egg-stock`);
  }

  movements(productionUnitId: number, filters: EggStockFilters): Observable<PaginatedResponse<EggStockTransaction>> {
    return this.api.get<PaginatedResponse<EggStockTransaction>>(
      `production-units/${productionUnitId}/egg-stock/movements`, { params: { ...filters } },
    );
  }

  movement(id: string): Observable<ApiEnvelope<EggStockTransaction>> {
    return this.api.get<ApiEnvelope<EggStockTransaction>>(`egg-stock/movements/${id}`);
  }

  receipt(productionUnitId: number, body: EggStockReceiptInput, idempotencyKey: string): Observable<ApiEnvelope<EggCommandResult>> {
    return this.command(`production-units/${productionUnitId}/egg-stock/receipts`, body, idempotencyKey);
  }

  issue(productionUnitId: number, body: EggStockIssueInput, idempotencyKey: string): Observable<ApiEnvelope<EggCommandResult>> {
    return this.command(`production-units/${productionUnitId}/egg-stock/issues`, body, idempotencyKey);
  }

  correct(id: string, body: EggStockCorrectionInput, idempotencyKey: string): Observable<ApiEnvelope<EggCommandResult>> {
    return this.command(`egg-stock/movements/${id}`, body, idempotencyKey, 'PATCH');
  }

  cancel(id: string, body: EggStockCancellationInput, idempotencyKey: string): Observable<ApiEnvelope<EggCommandResult>> {
    return this.command(`egg-stock/movements/${id}/cancellation`, body, idempotencyKey);
  }

  private command<T>(path: string, body: T, idempotencyKey: string, method: 'POST' | 'PATCH' = 'POST'): Observable<ApiEnvelope<EggCommandResult>> {
    const options = { headers: { 'Idempotency-Key': idempotencyKey } };
    return method === 'PATCH'
      ? this.api.patch<ApiEnvelope<EggCommandResult>, T>(path, body, options)
      : this.api.post<ApiEnvelope<EggCommandResult>, T>(path, body, options);
  }
}
