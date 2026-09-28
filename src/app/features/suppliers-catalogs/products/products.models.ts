export const PRODUCT_KINDS = [
  { value: 'raw_material', label: 'Materia prima' },
  { value: 'supply', label: 'Insumo' },
  { value: 'finished_feed', label: 'Ración' },
  { value: 'egg', label: 'Huevo' },
  { value: 'medicine', label: 'Medicamento' },
  { value: 'vaccine', label: 'Vacuna' },
  { value: 'other', label: 'Otro' },
] as const;

export const BASE_UNITS = [
  { value: 'unit', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'g', label: 'Gramo' },
  { value: 'l', label: 'Litro' },
  { value: 'ml', label: 'Mililitro' },
  { value: 'dose', label: 'Dosis' },
] as const;

export type ProductKind = typeof PRODUCT_KINDS[number]['value'];
export type BaseUnit = typeof BASE_UNITS[number]['value'];
export type ProductStatus = 'active' | 'inactive';
export type ProductEditableField = 'sku' | 'name' | 'kind' | 'base_unit' | 'stock_tracked';

export type ProductSpecializedOwner =
  | { type: 'vaccine'; id: string }
  | { type: 'egg_stock' };

export interface ProductCapabilities {
  editable_fields: string[];
  activate: boolean;
  deactivate: boolean;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  kind: ProductKind;
  base_unit: BaseUnit;
  stock_tracked: boolean;
  status: ProductStatus;
  system_managed: boolean;
  specialized_owner: ProductSpecializedOwner | null;
  capabilities: ProductCapabilities;
}

export interface ProductInput {
  sku: string;
  name: string;
  kind: ProductKind;
  base_unit: BaseUnit;
  stock_tracked: boolean;
}

export interface PaginatedProducts {
  data: Product[];
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta: { current_page: number; from: number | null; last_page: number; per_page: number; to: number | null; total: number };
}

const kindLabels: Record<ProductKind, string> = Object.fromEntries(PRODUCT_KINDS.map(({ value, label }) => [value, label])) as Record<ProductKind, string>;
const unitLabels: Record<BaseUnit, string> = Object.fromEntries(BASE_UNITS.map(({ value, label }) => [value, label])) as Record<BaseUnit, string>;

export function productKindLabel(kind: ProductKind): string { return kindLabels[kind] ?? 'Otro'; }
export function baseUnitLabel(unit: BaseUnit): string { return unitLabels[unit] ?? 'Unidad'; }
export function productStatusLabel(status: ProductStatus): string { return status === 'active' ? 'Activo' : 'Inactivo'; }
export function stockTrackedLabel(tracked: boolean): string { return tracked ? 'Sí' : 'No'; }
