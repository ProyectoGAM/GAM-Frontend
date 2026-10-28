import { HttpErrorResponse } from '@angular/common/http';
import { ParamMap } from '@angular/router';
import { CatalogFilters, CatalogFormValue, CreateMedicine, CreateVaccine } from '../interfaces/health-catalog';
import { HealthCatalogKind, HealthUnit } from '../types/health-catalog.type';

export const CATALOGS = {
  vaccines: { title: 'Vacunación', noun: 'vacuna', plural: 'vacunas', create: 'Nueva vacuna', button: 'Crear vacuna', path: '/administracion/manejo-lotes/vacunacion', icon: 'medkit-outline' },
  medicines: { title: 'Medicamentos', noun: 'medicamento', plural: 'medicamentos', create: 'Nuevo medicamento', button: 'Crear medicamento', path: '/administracion/manejo-lotes/medicacion', icon: 'bandage-outline' },
} as const;
export const HEALTH_UNITS: ReadonlyArray<{ value: HealthUnit; label: string }> = [
  { value: 'dose', label: 'Dosis' }, { value: 'unit', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo' }, { value: 'g', label: 'Gramo' },
  { value: 'l', label: 'Litro' }, { value: 'ml', label: 'Mililitro' },
];
export const unitLabel = (unit: HealthUnit) => HEALTH_UNITS.find((item) => item.value === unit)?.label ?? unit;
export function catalogFilters(params: ParamMap, kind: HealthCatalogKind): CatalogFilters {
  const supplier = params.get('proveedor') ?? '';
  const status = params.get('estado');
  const page = Number(params.get('page') ?? 1);
  return {
    search: (params.get('buscar') ?? '').trim().slice(0, 160),
    supplier: /^[1-9]\d*$/.test(supplier) && Number.isSafeInteger(Number(supplier)) ? supplier : '',
    status: kind === 'vaccines' && (status === 'active' || status === 'inactive') ? status : '',
    sku: kind === 'vaccines' ? (params.get('sku') ?? '').trim().slice(0, 80) : '',
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
  };
}
export function catalogQuery(filters: CatalogFilters) {
  return { buscar: filters.search || null, proveedor: filters.supplier || null, estado: filters.status || null, sku: filters.sku || null, page: filters.page > 1 ? filters.page : null };
}
export function catalogCommand(kind: HealthCatalogKind, value: CatalogFormValue): CreateMedicine | CreateVaccine {
  return kind === 'vaccines' ? {
    nombre: value.name.trim(), descripcion: value.description.trim(), sku: value.sku.trim(),
    proveedor_id: Number(value.supplier), detalles: value.details.trim() || null,
  } : { name: value.name.trim(), description: value.description.trim(), supplier_id: Number(value.supplier) };
}
export function healthError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'No se pudo conectar con el servidor. Intenta nuevamente.';
  if (error.status === 401) return 'La sesión expiró. Vuelve a iniciar sesión.';
  if (error.status === 403) return 'Este catálogo está disponible únicamente para administradores.';
  if (error.status === 404) return 'No se encontró el registro solicitado.';
  return fallback;
}
