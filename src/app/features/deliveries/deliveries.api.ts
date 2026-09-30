import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import {
  AddDeliveryLoadInput,
  CloseDeliveryInput,
  DeliveryClient,
  DeliveryEnvelope,
  DeliveryListResponse,
  DeliveryUnit,
  LocationInput,
  StartDeliveryInput,
  StopInput,
} from './delivery.models';

@Injectable({ providedIn: 'root' })
export class DeliveriesApi {
  private readonly api = inject(ApiClient);

  start(body: StartDeliveryInput, idempotencyKey: string): Observable<DeliveryEnvelope> {
    return this.api.post<DeliveryEnvelope, StartDeliveryInput>('repartos', body, this.commandOptions(idempotencyKey));
  }

  clients(search = ''): Observable<{ data: DeliveryClient[] }> {
    return this.api.get<{ data: DeliveryClient[] }>('repartos/clientes', { params: { ...(search ? { search } : {}), limit: 50 } });
  }

  units(): Observable<{ data: DeliveryUnit[] }> {
    return this.api.get<{ data: DeliveryUnit[] }>('repartos/unidades');
  }

  load(id: string, body: AddDeliveryLoadInput, idempotencyKey: string): Observable<DeliveryEnvelope> {
    return this.api.post<DeliveryEnvelope, AddDeliveryLoadInput>(`repartos/${id}/cargas`, body, this.commandOptions(idempotencyKey));
  }

  current(): Observable<DeliveryListResponse> {
    return this.api.get<DeliveryListResponse>('repartos/actuales');
  }

  list(params: Record<string, string | number | boolean | null | undefined> = {}): Observable<DeliveryListResponse> {
    return this.api.get<DeliveryListResponse>('repartos', { params });
  }

  detail(id: string): Observable<DeliveryEnvelope> {
    return this.api.get<DeliveryEnvelope>(`repartos/${id}`);
  }

  stop(id: string, body: StopInput, idempotencyKey: string): Observable<{ data: unknown }> {
    return this.api.post<{ data: unknown }, StopInput>(`repartos/${id}/entregas`, body, this.commandOptions(idempotencyKey));
  }

  locations(id: string, locations: LocationInput[]): Observable<{ data: { accepted: number; duplicates: number; pending: number } }> {
    return this.api.post<{ data: { accepted: number; duplicates: number; pending: number } }, { locations: LocationInput[] }>(
      `repartos/${id}/ubicaciones/lote`, { locations },
    );
  }

  close(id: string, body: CloseDeliveryInput, idempotencyKey: string): Observable<DeliveryEnvelope> {
    return this.api.post<DeliveryEnvelope, CloseDeliveryInput>(`repartos/${id}/cierre`, body, this.commandOptions(idempotencyKey));
  }

  private commandOptions(idempotencyKey: string) {
    return { headers: { 'Idempotency-Key': idempotencyKey } };
  }
}
