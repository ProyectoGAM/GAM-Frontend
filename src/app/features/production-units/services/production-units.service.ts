import { Injectable, inject } from '@angular/core';
import { concatMap, from, map, of, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  CreateProductionUnitRequest,
  CreateProductionUnitResponse,
  CreateFeedIngredientRequest,
  FeedStock,
  GeographyDepartment,
  GeographyLocality,
  HouseFlock,
  InventoryIngredient,
  PaginatedResponse,
  PoultryHouse,
  PoultryHouseDetail,
  PoultryHouseListItem,
  PoultryHouseType,
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

  poultryHouses(productionUnitId: number, type?: PoultryHouseType) {
    return this.allPages<PoultryHouse>(
      `production-units/${productionUnitId}/poultry-houses`,
      type ? { type } : {},
    );
  }

  getPoultryHouseById(id: number) {
    return this.api.get<{ data: PoultryHouseDetail }>(`poultry-houses/${id}`);
  }

  houseFlocks(houseId: number) {
    return this.allPages<HouseFlock>(`poultry-houses/${houseId}/flocks`);
  }

  feedStock(houseId: number) {
    return this.api.get<{ data: FeedStock }>(`plantas-racion/${houseId}/stock`);
  }

  inventoryIngredients() {
    return this.allPages<InventoryIngredient>('products', { kind: 'raw_material', status: 'active' }).pipe(
      map((products) => products.filter((product) => product.kind === 'raw_material'
        && product.status === 'active' && product.base_unit === 'g' && product.stock_tracked)),
    );
  }

  createFeedIngredient(houseId: number, request: CreateFeedIngredientRequest, idempotencyKey: string) {
    return this.api.post<unknown, CreateFeedIngredientRequest>(
      `plantas-racion/${houseId}/ingredientes`,
      request,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  }

  updatePoultryHouseStatus(id: number, status: PoultryHouse['status']) {
    return this.api.patch<{ data: PoultryHouseDetail }, { status: PoultryHouse['status'] }>(
      `poultry-houses/${id}/status`,
      { status },
    );
  }

  listAllPoultryHouses() {
    return this.listAll().pipe(
      concatMap((units) => from(units).pipe(
        concatMap((productionUnit) => this.poultryHouses(productionUnit.id, 'poultry').pipe(
          map((houses) => houses
            .filter((house) => house.type === 'poultry')
            .map((house): PoultryHouseListItem => ({ ...house, productionUnit }))),
        )),
        toArray(),
        map((houseGroups) => houseGroups.flat()),
      )),
    );
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

  private allPages<T>(path: string, filters: Record<string, string | number | boolean> = {}) {
    return this.api.get<PaginatedResponse<T>>(path, {
      params: { ...filters, page: 1, per_page: 100 },
    }).pipe(
      concatMap((firstPage) => {
        if (firstPage.meta.last_page <= 1) return of(firstPage.data);

        const remainingPages = Array.from(
          { length: firstPage.meta.last_page - 1 },
          (_, index) => index + 2,
        );

        return from(remainingPages).pipe(
          concatMap((page) => this.api.get<PaginatedResponse<T>>(path, {
            params: { ...filters, page, per_page: 100 },
          })),
          map((response) => response.data),
          toArray(),
          map((pages) => [firstPage.data, ...pages].flat()),
        );
      }),
    );
  }
}
