import { Injectable, inject } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { VehicleDetail, VehicleDriverOption, VehicleEnvelope, VehicleFuelInput, VehicleListResponse, VehicleOption } from '../interfaces/vehicle';

@Injectable({ providedIn: 'root' })
export class VehiclesApi {
  private readonly api = inject(ApiClient);

  list(filters: Record<string, string | number | undefined> = {}): Observable<VehicleListResponse> {
    return this.api.get<VehicleListResponse>('vehiculos', { params: { per_page: 100, ...filters } });
  }
  available(search = ''): Observable<{ data: VehicleOption[] }> {
    return this.api.get<{ data: VehicleOption[] }>('vehiculos/disponibles', { params: search ? { search } : {} });
  }
  drivers(): Observable<{ data: VehicleDriverOption[] }> { return this.api.get<{ data: VehicleDriverOption[] }>('vehiculos/conductores'); }
  detail(id: string): Observable<VehicleDetail> { return this.api.get<VehicleDetail>(`vehiculos/${id}`); }
  create(body: Record<string, unknown>): Observable<VehicleEnvelope> { return this.api.post<VehicleEnvelope>('vehiculos', body); }
  update(id: string, body: Record<string, unknown>): Observable<VehicleEnvelope> { return this.api.patch<VehicleEnvelope>(`vehiculos/${id}`, body); }
  status(id: string, body: { status: string; reason: string }): Observable<VehicleEnvelope> { return this.api.patch<VehicleEnvelope>(`vehiculos/${id}/estado`, body); }
  reading(id: string, body: Record<string, unknown>, key: string): Observable<{ data: unknown }> { return this.api.post<{ data: unknown }>(`vehiculos/${id}/lecturas`, body, this.commandOptions(key)); }
  startUsage(id: string, body: Record<string, unknown>, key: string): Observable<{ data: unknown }> { return this.api.post<{ data: unknown }>(`vehiculos/${id}/usos`, body, this.commandOptions(key)); }
  closeUsage(id: string, body: Record<string, unknown>): Observable<{ data: unknown }> { return this.api.post<{ data: unknown }>(`vehiculos/usos/${id}/cierre`, body); }
  fuel(id: string, body: FormData, key: string): Observable<{ data: unknown }> { return this.api.post<{ data: unknown }>(`vehiculos/${id}/combustible`, body, this.commandOptions(key)); }
  downloadFuelReceipt(id: string, entryId: string): Observable<HttpResponse<Blob>> { return this.api.getFile(`vehiculos/${id}/combustible/${entryId}/comprobante`); }
  recordFuel(id: string, body: VehicleFuelInput, key: string): Observable<{ data: unknown }> {
    if (body.receipt) {
      const form = new FormData();
      form.append('liters', body.liters); form.append('fuel_type', body.fuel_type); form.append('amount', body.amount); form.append('occurred_at', body.occurred_at);
      form.append('usage_id', body.usage_id); form.append('receipt', body.receipt, body.receipt.name);
      if (body.supplier) form.append('supplier', body.supplier);
      if (body.odometer_km) form.append('odometer_km', body.odometer_km);
      if (body.notes) form.append('notes', body.notes);
      return this.api.post<{ data: unknown }>(`vehiculos/${id}/combustible`, form, this.commandOptions(key));
    }
    const input = {
      vehicle_id: body.vehicle_id,
      usage_id: body.usage_id,
      liters: body.liters,
      fuel_type: body.fuel_type,
      amount: body.amount,
      occurred_at: body.occurred_at,
      supplier: body.supplier,
      odometer_km: body.odometer_km,
      notes: body.notes,
    };
    return this.api.post<{ data: unknown }>(`vehiculos/${id}/combustible`, input, this.commandOptions(key));
  }
  createPlan(id: string, body: Record<string, unknown>): Observable<{ data: unknown }> { return this.api.post<{ data: unknown }>(`vehiculos/${id}/planes-mantenimiento`, body); }
  updatePlan(id: string, plan: string, body: Record<string, unknown>): Observable<{ data: unknown }> { return this.api.patch<{ data: unknown }>(`vehiculos/${id}/planes-mantenimiento/${plan}`, body); }
  createMaintenance(id: string, body: Record<string, unknown>, key: string): Observable<{ data: unknown }> { return this.api.post<{ data: unknown }>(`vehiculos/${id}/mantenimientos`, body, this.commandOptions(key)); }
  transitionMaintenance(id: string, transition: 'inicio' | 'finalizacion' | 'anulacion', body: Record<string, unknown>, key: string): Observable<{ data: unknown }> {
    return this.api.post<{ data: unknown }>(`vehiculos/mantenimientos/${id}/${transition}`, body, this.commandOptions(key));
  }
  uploadMaintenanceDocument(id: string, maintenanceId: string, body: FormData): Observable<{ data: unknown }> { return this.api.post<{ data: unknown }>(`vehiculos/${id}/mantenimientos/${maintenanceId}/documentos`, body); }
  downloadMaintenanceDocument(id: string, maintenanceId: string, documentId: string): Observable<HttpResponse<Blob>> { return this.api.getFile(`vehiculos/${id}/mantenimientos/${maintenanceId}/documentos/${documentId}`); }
  uploadDocument(id: string, body: FormData): Observable<{ data: unknown }> { return this.api.post<{ data: unknown }>(`vehiculos/${id}/documentos`, body); }
  downloadDocument(id: string, documentId: string): Observable<HttpResponse<Blob>> { return this.api.getFile(`vehiculos/${id}/documentos/${documentId}`); }

  private commandOptions(key: string) { return { headers: { 'Idempotency-Key': key } }; }
}
