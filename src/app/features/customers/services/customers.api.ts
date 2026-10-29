import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CustomerStatus } from '../types/customer.types';

import { ApiClient } from '../../../core/api/api-client';
import { DeliveryStop } from '../../deliveries/delivery.models';
import { Customer, CustomerAccountSnapshot, CustomerAdjustmentInput, CustomerEnvelope, CustomerInput, CustomerListFilters, CustomerMovementPage, CustomerMovementResult, CustomerPaymentInput, MovementFilters, Paginated } from '../interfaces/customer';

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly api = inject(ApiClient);

  list(filters: CustomerListFilters = {}, page = 1): Observable<Paginated<Customer>> {
    return this.api.get<Paginated<Customer>>('clientes', { params: { ...filters, page } });
  }

  detail(id: string): Observable<CustomerEnvelope> { return this.api.get<CustomerEnvelope>(`clientes/${id}`); }
  account(id: string): Observable<{ data: CustomerAccountSnapshot }> { return this.api.get<{ data: CustomerAccountSnapshot }>(`clientes/${id}/cuenta-corriente`); }

  create(body: CustomerInput, key: string): Observable<CustomerEnvelope> {
    return this.api.post<CustomerEnvelope>('clientes', body, this.options(key));
  }

  update(id: string, body: CustomerInput, key: string): Observable<CustomerEnvelope> {
    return this.api.patch<CustomerEnvelope>(`clientes/${id}`, body, this.options(key));
  }

  status(id: string, status: CustomerStatus, key: string): Observable<CustomerEnvelope> {
    return this.api.patch<CustomerEnvelope>(`clientes/${id}/estado`, { status }, this.options(key));
  }

  movements(id: string, filters: MovementFilters = {}, page = 1): Observable<CustomerMovementPage> {
    return this.api.get<CustomerMovementPage>(`clientes/${id}/movimientos`, { params: { ...filters, page } });
  }

  deliveries(id: string, page = 1): Observable<Paginated<DeliveryStop>> {
    return this.api.get<Paginated<DeliveryStop>>(`clientes/${id}/entregas`, { params: { page, per_page: 25 } });
  }

  pay(id: string, body: CustomerPaymentInput, key: string): Observable<CustomerMovementResult> {
    return this.api.post<CustomerMovementResult>(`clientes/${id}/pagos`, body, this.options(key));
  }

  adjust(id: string, body: CustomerAdjustmentInput, key: string): Observable<CustomerMovementResult> {
    return this.api.post<CustomerMovementResult>(`clientes/${id}/ajustes`, body, this.options(key));
  }

  reverse(id: string, movementId: string, reason: string, key: string): Observable<CustomerMovementResult> {
    return this.api.post<CustomerMovementResult>(`clientes/${id}/movimientos/${movementId}/reversion`, { reason }, this.options(key));
  }

  private options(key: string) { return { headers: { 'Idempotency-Key': key } }; }
}
