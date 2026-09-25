import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  ApiEnvelope,
  AdjustmentInput,
  InventoryBalanceFilters,
  InventoryMovement,
  InventoryMovementFilters,
  IssueInput,
  LossInput,
  PaginatedResponse,
  ReceiptInput,
  StockBalance,
  TransferInput,
} from '../interfaces/inventory';

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly api = inject(ApiClient);

  balances(filters: InventoryBalanceFilters): Observable<PaginatedResponse<StockBalance>> {
    return this.api.get<PaginatedResponse<StockBalance>>('inventory/balances', { params: { ...filters } });
  }

  setMinimumStock(id: number, minimum_quantity: string): Observable<ApiEnvelope<StockBalance>> {
    return this.api.patch<ApiEnvelope<StockBalance>, { minimum_quantity: string }>(
      `inventory/balances/${id}/minimum-stock`, { minimum_quantity },
    );
  }

  movements(filters: InventoryMovementFilters): Observable<PaginatedResponse<InventoryMovement>> {
    return this.api.get<PaginatedResponse<InventoryMovement>>('inventory/movements', { params: { ...filters } });
  }

  movement(id: number): Observable<ApiEnvelope<InventoryMovement>> {
    return this.api.get<ApiEnvelope<InventoryMovement>>(`inventory/movements/${id}`);
  }

  receive(body: ReceiptInput, idempotencyKey: string): Observable<ApiEnvelope<InventoryMovement>> {
    return this.command('inventory/receipts', body, idempotencyKey);
  }

  issue(body: IssueInput, idempotencyKey: string): Observable<ApiEnvelope<InventoryMovement>> {
    return this.command('inventory/issues', body, idempotencyKey);
  }

  loss(body: LossInput, idempotencyKey: string): Observable<ApiEnvelope<InventoryMovement>> {
    return this.command('inventory/losses', body, idempotencyKey);
  }

  adjustment(body: AdjustmentInput, idempotencyKey: string): Observable<ApiEnvelope<InventoryMovement>> {
    return this.command('inventory/adjustments', body, idempotencyKey);
  }

  transfer(body: TransferInput, idempotencyKey: string): Observable<ApiEnvelope<InventoryMovement>> {
    return this.command('inventory/transfers', body, idempotencyKey);
  }

  reverse(id: number, reason: string, idempotencyKey: string): Observable<ApiEnvelope<InventoryMovement>> {
    return this.command(`inventory/movements/${id}/reversals`, { reason }, idempotencyKey);
  }

  private command<T>(path: string, body: T, idempotencyKey: string): Observable<ApiEnvelope<InventoryMovement>> {
    return this.api.post<ApiEnvelope<InventoryMovement>, T>(path, body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }
}
