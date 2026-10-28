import { CatalogRecord, HealthPage, Medicine, Vaccine } from '../interfaces/health-catalog';
export const vaccine: Vaccine = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', sku: 'VAC-01', producto_id: 8, unidad_base: 'dose', estado: 'active',
  nombre: 'Vacuna A', descripcion: 'Descripción de vacuna', detalles: null,
  proveedor: { id: 4, nombre: 'Proveedor actual', nombre_al_asociar: 'Proveedor anterior' },
  creado_por: { id: 1, nombre_al_crear: 'María' }, creado_en: '2026-10-27T12:00:00Z', actualizado_en: '2026-10-27T12:00:00Z', operacion_id: 'operation',
};
export const medicine: Medicine = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAW', product_id: null, name: 'Medicamento A', description: 'Descripción de medicamento',
  supplier: { id: 4, name_at_registration: 'Proveedor al registrar' }, created_by: { id: 1, name_at_registration: 'María al registrar' },
  created_at: '2026-10-27T12:00:00Z', operation_id: 'operation',
};
export const vaccineItem: CatalogRecord = {
  id: vaccine.id, name: vaccine.nombre, description: vaccine.descripcion, supplier: vaccine.proveedor.nombre, creator: 'María',
  createdAt: vaccine.creado_en, productId: vaccine.producto_id, vaccine: { sku: vaccine.sku, unit: 'dose', status: 'active', details: null },
};
export const medicineItem: CatalogRecord = {
  id: medicine.id, name: medicine.name, description: medicine.description, supplier: medicine.supplier.name_at_registration,
  creator: medicine.created_by.name_at_registration, createdAt: medicine.created_at, productId: medicine.product_id,
};
export function healthPage<T>(data: T[], page = 1, lastPage = 1): HealthPage<T> {
  return { data, meta: { current_page: page, last_page: lastPage, total: data.length, per_page: 25 },
    links: { first: null, last: null, next: null, prev: null } };
}
