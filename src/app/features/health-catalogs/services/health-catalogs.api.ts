import { Injectable, inject } from '@angular/core';
import { EMPTY, expand, map, reduce } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { SuppliersApi } from '../../suppliers-catalogs/suppliers/suppliers.api';
import { CatalogFilters, CatalogRecord, CreateMedicine, CreateVaccine, HealthPage, HealthSupplier, Medicine, Vaccine } from '../interfaces/health-catalog';
import { HealthCatalogKind } from '../types/health-catalog.type';

const vaccineRecord = (item: Vaccine): CatalogRecord => ({
  id: item.id, name: item.nombre, description: item.descripcion, supplier: item.proveedor.nombre,
  creator: item.creado_por.nombre_al_crear, createdAt: item.creado_en, productId: item.producto_id,
  vaccine: { sku: item.sku, unit: item.unidad_base, status: item.estado, details: item.detalles },
});
const medicineRecord = (item: Medicine): CatalogRecord => ({
  id: item.id, name: item.name, description: item.description, supplier: item.supplier.name_at_registration,
  creator: item.created_by.name_at_registration, createdAt: item.created_at, productId: item.product_id,
});
@Injectable({ providedIn: 'root' })
export class HealthCatalogsApi {
  private readonly api = inject(ApiClient);
  private readonly suppliersApi = inject(SuppliersApi);
  list(kind: HealthCatalogKind, filters: CatalogFilters) {
    const common = { page: filters.page, per_page: 25 };
    return kind === 'vaccines'
      ? this.api.get<HealthPage<Vaccine>>('vacunas', { params: { ...common, buscar: filters.search || undefined, proveedor_id: filters.supplier || undefined, estado: filters.status || undefined, sku: filters.sku || undefined } })
        .pipe(map((page) => ({ ...page, data: page.data.map(vaccineRecord) })))
      : this.api.get<HealthPage<Medicine>>('medicines', { params: { ...common, search: filters.search || undefined, supplier_id: filters.supplier || undefined } })
        .pipe(map((page) => ({ ...page, data: page.data.map(medicineRecord) })));
  }
  vaccine(id: string) {
    return this.api.get<{ data: Vaccine }>('vacunas/' + encodeURIComponent(id)).pipe(map((response) => vaccineRecord(response.data)));
  }
  create(kind: HealthCatalogKind, body: CreateMedicine | CreateVaccine, key: string) {
    const options = { headers: { 'Idempotency-Key': key } };
    return kind === 'vaccines'
      ? this.api.post<{ data: Vaccine }>('vacunas', body, options).pipe(map((response) => vaccineRecord(response.data)))
      : this.api.post<{ data: Medicine }>('medicines', body, options).pipe(map((response) => medicineRecord(response.data)));
  }
  suppliers(activeOnly: boolean) {
    const page = (number: number) => this.suppliersApi.list({ status: activeOnly ? 'active' : undefined, per_page: 100 }, number);
    return page(1).pipe(
      expand((response) => response.meta.current_page < response.meta.last_page ? page(response.meta.current_page + 1) : EMPTY),
      reduce((all, response) => [...all, ...response.data.map(({ id, name, status }) => ({ id, name, status }))], [] as HealthSupplier[]),
      map((items) => [...new Map(items.filter((item) => !activeOnly || item.status === 'active').map((item) => [item.id, item])).values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id - b.id)),
    );
  }
}
