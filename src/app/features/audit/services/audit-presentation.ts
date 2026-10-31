import { AuditActor, AuditActorOption, AuditFilters, AuditSummary } from '../interfaces/audit';

export const AUDIT_MODULES = [
  { id: '', label: 'Todo el sistema', icon: 'layers-outline' },
  { id: 'lots', label: 'Lotes', icon: 'egg-outline' },
  { id: 'inventory', label: 'Inventario y raciones', icon: 'cube-outline' },
  { id: 'farm_structure', label: 'Instalaciones y UP', icon: 'business-outline' },
  { id: 'management_plans', label: 'Manejo y sanidad', icon: 'clipboard-outline' },
  { id: 'suppliers_and_catalogs', label: 'Proveedores y catálogos', icon: 'documents-outline' },
  { id: 'identity', label: 'Usuarios y accesos', icon: 'people-outline' },
  { id: 'deliveries', label: 'Repartos', icon: 'car-outline' },
  { id: 'reporting', label: 'Reportes', icon: 'bar-chart-outline' },
] as const;

export function moduleLabel(name: string | null): string {
  return AUDIT_MODULES.find((module) => module.id === name)?.label ?? 'Otros registros';
}
export function actorLabel(actor: AuditActor): string {
  if (actor.kind === 'system') return 'Sistema';
  return actor.name?.trim() || actor.current_name?.trim() || 'Responsable no disponible';
}
export function actorKey(actor: AuditActorOption): string {
  return JSON.stringify([actor.kind, actor.type, actor.value]);
}
export function actorFilters(actor: AuditActorOption | null): Pick<AuditFilters, 'actor_kind' | 'actor_type' | 'actor_id'> {
  if (!actor) return {};
  return actor.kind === 'person' && actor.value !== null && actor.type
    ? { actor_kind: 'person', actor_type: actor.type, actor_id: actor.value }
    : { actor_kind: actor.kind };
}
export function auditTitle(presentation: AuditSummary): string {
  return presentation.title?.trim() || 'Actividad registrada';
}
export function unitLabel(presentation: AuditSummary): string {
  return presentation.production_unit?.name?.trim() || 'Sin unidad productiva registrada';
}
export function sourceLabel(source: string | null): string {
  const labels: Record<string, string> = { api: 'Registro desde el sistema', application: 'Aplicación', scheduler: 'Proceso programado', console: 'Proceso interno', web: 'Web', native: 'Aplicación móvil', seeder: 'Datos iniciales' };
  return source ? labels[source] ?? 'Otro origen' : 'Sin origen registrado';
}
