import { HttpErrorResponse } from '@angular/common/http';
import { AdminUser, isAdminUser } from '../../../core/auth/access-policy';
import { hasAnyPermission } from '../../../core/auth/permission-keys';
import { BeakTrimmingRow } from '../interfaces/flock-beak-trimming';
import { HealthHistoryEntry } from '../interfaces/flock-health.interface';

const dateTime = new Intl.DateTimeFormat('es-UY', {
  timeZone: 'America/Montevideo', dateStyle: 'short', timeStyle: 'short',
});
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const formatDate = (value: string) => Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : 'Fecha no disponible';

export function canViewBeakTrimmings(user: AdminUser | null): boolean {
  return isAdminUser(user) || hasAnyPermission(user?.permissions, 'can_view_management_plans');
}

export function canChangeBeakTrimmings(user: AdminUser | null, action: 'record' | 'reverse'): boolean {
  return isAdminUser(user) || (canViewBeakTrimmings(user)
    && hasAnyPermission(user?.permissions, 'can_execute_management_plans')
    && hasAnyPermission(user?.permissions, `can_${action}_beak_trimming`));
}

export function beakTrimmingRows(entries: HealthHistoryEntry[]): BeakTrimmingRow[] {
  const corrections = new Map(entries.filter((entry) => entry.type === 'management_correction'
    && entry.module_data['original_type'] === 'manual_practice')
    .map((entry) => [entry.module_data['original_id'], entry]));
  return entries.filter((entry) => entry.type === 'manual_practice' && entry.module_data['practice_type'] === 'beak_trimming')
    .map((entry) => {
      const reversal = corrections.get(entry.id);
      return {
        id: entry.id,
        occurredAt: entry.occurred_at,
        date: formatDate(entry.occurred_at),
        responsible: text(entry.responsible?.name) ?? 'Responsable no disponible',
        planTitle: entry.plan_activity_title,
        notes: text(entry.module_data['notes']),
        antecedent: entry.provenance.kind === 'antecedent',
        reversal: reversal ? {
          date: formatDate(reversal.occurred_at),
          responsible: text(reversal.responsible?.name) ?? 'Responsable no disponible',
          reason: text(reversal.module_data['correction_reason']),
        } : null,
      };
    });
}

export function beakTrimmingError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Sin conexión. Revisá tu conexión y volvé a intentar.';
  if (error.status === 401 || error.status === 403) return 'Tu cuenta no tiene permiso para realizar esta acción.';
  if (error.status === 404) return 'El lote o el registro ya no está disponible.';
  if (error.status === 409 || error.status === 422) {
    const body = error.error as { detail?: unknown; errors?: Record<string, string[]> } | null;
    return text(Object.values(body?.errors ?? {})[0]?.[0] ?? body?.detail) ?? fallback;
  }
  return fallback;
}
