import { Injectable, inject } from '@angular/core';
import { catchError, concatMap, from, map, of, switchMap, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  CreateProductionUnitRequest,
  CreateProductionUnitResponse,
  CreatePoultryHouseRequest,
  CreateFeedIngredientRequest,
  FeedStock,
  GeographyDepartment,
  GeographyLocality,
  HouseFlock,
  InventoryIngredient,
  PaginatedResponse,
  ProductionUnitAdministrativeContext,
  PoultryHouse,
  PoultryHouseDetail,
  PoultryHouseListItem,
  PoultryHouseType,
  ProductionUnit,
  UpdatePoultryHouseRequest,
  UpdateProductionUnitRequest,
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

  validateLocation(latitude: number, longitude: number) {
    return this.api.post<void, { latitude: number; longitude: number }>(
      'production-units/validate-location', { latitude, longitude },
    );
  }

  resolveLocalityId(context: ProductionUnitAdministrativeContext | null | undefined) {
    const localityName = this.catalogKey(context?.locality);
    const departmentName = this.catalogKey(context?.department);
    if (!localityName || !departmentName) return of(null);

    return this.departments().pipe(
      map((departments) => departments.filter((department) => this.catalogKey(department.name) === departmentName)),
      switchMap((departments) => {
        if (departments.length !== 1) return of(null);
        return this.localities(departments[0].id).pipe(
          map((localities) => {
            const matches = localities.filter((locality) => this.catalogKey(locality.name) === localityName);
            return matches.length === 1 && matches[0].department_id === departments[0].id
              ? matches[0].id
              : null;
          }),
        );
      }),
      catchError(() => of(null)),
    );
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

  createPoultryHouse(productionUnitId: number, request: CreatePoultryHouseRequest) {
    return this.api.post<{ data: PoultryHouseDetail }, CreatePoultryHouseRequest>(
      `production-units/${productionUnitId}/poultry-houses`, request,
    );
  }

  updatePoultryHouse(id: number, request: UpdatePoultryHouseRequest) {
    return this.api.patch<{ data: PoultryHouseDetail }, UpdatePoultryHouseRequest>(
      `poultry-houses/${id}`, request,
    );
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
    return this.listAllHouses('poultry');
  }

  listAllFeedPlants() {
    return this.listAllHouses('feed');
  }

  private listAllHouses(type: PoultryHouseType) {
    return this.listAll().pipe(
      concatMap((units) => from(units).pipe(
        concatMap((productionUnit) => this.poultryHouses(productionUnit.id, type).pipe(
          map((houses) => houses
            .filter((house) => house.type === type)
            .map((house): PoultryHouseListItem => ({ ...house, productionUnit }))),
        )),
        toArray(),
        map((houseGroups) => houseGroups.flat()),
      )),
    );
  }

  update(id: number, request: UpdateProductionUnitRequest) {
    return this.api.patch<{ data: ProductionUnit }, UpdateProductionUnitRequest>(
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

  private catalogKey(value: string | null | undefined): string {
    return value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-UY') ?? '';
  }
}
