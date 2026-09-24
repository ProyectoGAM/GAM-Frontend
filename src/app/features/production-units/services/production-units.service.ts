import { Injectable, inject } from '@angular/core';
import { concatMap, from, map, of, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  CreateProductionUnitRequest,
  CreateProductionUnitResponse,
  GeographyDepartment,
  GeographyLocality,
  PaginatedResponse,
  PoultryHouse,
  ProductionUnit,
} from '../interfaces/production-unit.interface';

@Injectable({ providedIn: 'root' })
export class ProductionUnitsService {
  private readonly api = inject(ApiClient);

  departments() {
    return this.allPages<GeographyDepartment>('departments');
  }

  localities(departmentId: number) {
    return this.allPages<GeographyLocality>(`departments/${departmentId}/localities`);
  }

  create(request: CreateProductionUnitRequest) {
    return this.api.post<CreateProductionUnitResponse, CreateProductionUnitRequest>(
      'production-units',
      request,
    );
  }

  listAll() {
    return this.allPages<ProductionUnit>('production-units');
  }

  getById(id: number) {
    return this.api.get<{ data: ProductionUnit }>(`production-units/${id}`);
  }

  poultryHouses(productionUnitId: number) {
    return this.allPages<PoultryHouse>(`production-units/${productionUnitId}/poultry-houses`);
  }

  update(id: number, request: Partial<Omit<CreateProductionUnitRequest, 'status'>>) {
    return this.api.patch<{ data: ProductionUnit }, Partial<Omit<CreateProductionUnitRequest, 'status'>>>(
      `production-units/${id}`,
      request,
    );
  }

  updateStatus(id: number, status: 'active' | 'inactive') {
    return this.api.patch<{ data: ProductionUnit }, { status: 'active' | 'inactive' }>(
      `production-units/${id}/status`,
      { status },
    );
  }

  archive(id: number) {
    return this.api.patch<{ data: ProductionUnit }, { status: 'archived' }>(
      `production-units/${id}/status`,
      { status: 'archived' },
    );
  }

  private allPages<T>(path: string) {
    return this.api.get<PaginatedResponse<T>>(path, {
      params: { page: 1, per_page: 100 },
    }).pipe(
      concatMap((firstPage) => {
        if (firstPage.meta.last_page <= 1) return of(firstPage.data);

        const remainingPages = Array.from(
          { length: firstPage.meta.last_page - 1 },
          (_, index) => index + 2,
        );

        return from(remainingPages).pipe(
          concatMap((page) => this.api.get<PaginatedResponse<T>>(path, {
            params: { page, per_page: 100 },
          })),
          map((response) => response.data),
          toArray(),
          map((pages) => [firstPage.data, ...pages].flat()),
        );
      }),
    );
  }
}
