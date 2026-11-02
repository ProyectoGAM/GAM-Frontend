import { inject, Injectable } from '@angular/core';
import { defer, EMPTY, expand, map, reduce } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { InstallationMaintenance, MaintenanceCorrection, MaintenanceCostTotal, MaintenanceFilters, MaintenanceInput, MaintenancePage } from '../interfaces/installation-maintenance.interface';
import { parseUyuAmount, uyuDecimal } from '../../../shared/utils/uyu-money';

@Injectable({ providedIn: 'root' })
export class InstallationMaintenanceService {
  private readonly api = inject(ApiClient);

  list(houseId: number, filters: MaintenanceFilters = {}, page = 1) {
    return this.api.get<MaintenancePage>(`poultry-houses/${houseId}/maintenances`, {
      params: { ...filters, page, per_page: 20 },
    });
  }

  totalCost(houseId: number) {
    return defer(() => {
      const totals = new Map<string, bigint>();
      const seen = new Set<number>();
      const loadPage = (page: number) => this.api.get<MaintenancePage>(`poultry-houses/${houseId}/maintenances`, {
        params: { status: 'completed', page, per_page: 100 },
      });
      return loadPage(1).pipe(
        expand((response) => response.meta.current_page < response.meta.last_page ? loadPage(response.meta.current_page + 1) : EMPTY, 1),
        reduce((sums, response) => {
          for (const record of response.data) {
            if (record.status !== 'completed' || seen.has(record.id)) continue;
            seen.add(record.id);
            const amount = parseUyuAmount(record.cost.amount);
            if (amount === null || amount < 0n || !record.cost.currency) throw new Error('Invalid maintenance cost');
            sums.set(record.cost.currency, (sums.get(record.cost.currency) ?? 0n) + amount);
          }
          return sums;
        }, totals),
        map((sums): MaintenanceCostTotal[] => sums.size
          ? Array.from(sums, ([currency, amount]) => ({ currency, amount: uyuDecimal(amount) }))
          : [{ currency: 'UYU', amount: '0.000' }]),
      );
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
