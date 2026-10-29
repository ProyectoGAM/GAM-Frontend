import { HealthUnit } from '../types/health-catalog.type';

export interface HealthPage<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number; per_page: number };
  links: { first: string | null; last: string | null; next: string | null; prev: string | null };
}
export interface Vaccine {
  id: string; sku: string; producto_id: number; unidad_base: HealthUnit; estado: 'active' | 'inactive';
  nombre: string; descripcion: string; detalles: string | null;
  proveedor: { id: number; nombre: string; nombre_al_asociar: string };
  creado_por: { id: number; nombre_al_crear: string };
  creado_en: string; actualizado_en: string; operacion_id: string;
}
export interface Medicine {
  id: string; product_id: number | null; name: string; description: string;
  supplier: { id: number; name_at_registration: string };
  created_by: { id: number; name_at_registration: string };
  created_at: string; operation_id: string;
}
export interface CatalogRecord {
  id: string; name: string; description: string; supplier: string; creator: string; createdAt: string;
  productId: number | null;
  vaccine?: { sku: string; unit: HealthUnit; status: 'active' | 'inactive'; details: string | null };
}
export interface CatalogFilters {
  search: string; supplier: string; status: '' | 'active' | 'inactive'; sku: string; page: number;
}
export interface HealthSupplier { id: number; name: string; status: 'active' | 'inactive' }
export interface CreateVaccine {
  sku: string; nombre: string; descripcion: string; proveedor_id: number;
  detalles: string | null; unidad_base?: HealthUnit;
}
export interface CreateMedicine { name: string; description: string; supplier_id: number }
export interface CatalogFormValue {
  name: string; description: string; supplier: string; sku: string; details: string;
}
