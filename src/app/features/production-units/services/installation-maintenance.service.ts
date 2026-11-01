import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { InstallationMaintenance, MaintenanceCorrection, MaintenanceFilters, MaintenanceInput, MaintenancePage } from '../interfaces/installation-maintenance.interface';

@Injectable({ providedIn: 'root' })
export class InstallationMaintenanceService {
  private readonly api = inject(ApiClient);

  list(houseId: number, filters: MaintenanceFilters = {}, page = 1) {
    return this.api.get<MaintenancePage>(`poultry-houses/${houseId}/maintenances`, {
      params: { ...filters, page, per_page: 20 },
    });
  }

  detail(id: number) {
    return this.api.get<{ data: InstallationMaintenance }>(`maintenances/${id}`).pipe(map(({ data }) => data));
  }

  create(houseId: number, body: MaintenanceInput, key: string) {
    return this.api.post<{ data: InstallationMaintenance }>(`poultry-houses/${houseId}/maintenances`, body, {
      headers: { 'Idempotency-Key': key },
    }).pipe(map(({ data }) => data));
  }

  correct(id: number, body: MaintenanceCorrection) {
    return this.api.patch<{ data: InstallationMaintenance }>(`maintenances/${id}`, body).pipe(map(({ data }) => data));
  }

  cancel(id: number, body: { version: number; reason: string }) {
    return this.api.post<{ data: InstallationMaintenance }>(`maintenances/${id}/cancellation`, body).pipe(map(({ data }) => data));
  }
}
