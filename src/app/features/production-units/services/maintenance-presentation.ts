import { HttpErrorResponse } from '@angular/common/http';
import { AuthUser } from '../../../core/auth/auth.types';
import { isAdminUser } from '../../../core/auth/access-policy';

export function canManageMaintenance(user: AuthUser | null): boolean {
  return isAdminUser(user) || user?.permissions?.includes('poultry-houses.manage') === true;
}

export function maintenanceToday(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function validMaintenanceDate(value: string): boolean {
  const parsed = new Date(value + 'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value && value <= maintenanceToday();
}

/** UYU admite dos decimales; se conserva el importe exacto sin redondear. */
export function maintenanceCost(value: string): string | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimals = ''] = normalized.split('.');
  return `${BigInt(whole)}.${decimals.padEnd(2, '0')}`;
}

export function maintenanceDateLabel(value: string): string {
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date) : value;
}

export function maintenanceTimestampLabel(value: string | null): string {
  if (!value) return 'No disponible';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-UY', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Montevideo',
  }).format(date) : 'No disponible';
}

export function maintenanceError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Sin conexión. Reintentá con los mismos datos para evitar duplicados.';
  if (error.status === 401 || error.status === 403) return 'No tenés permiso para realizar esta acción.';
  if (error.status === 404) return 'El registro o la instalación ya no está disponible.';
  const body: unknown = error.error;
  if ([409, 422].includes(error.status) && body && typeof body === 'object') {
    if ('detail' in body && typeof body.detail === 'string') return body.detail;
    if ('message' in body && typeof body.message === 'string') return body.message;
  }
  return fallback;
}

export function maintenanceFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof HttpErrorResponse)) return {};
  const body: unknown = error.error;
  if (!body || typeof body !== 'object' || !('errors' in body) || !body.errors || typeof body.errors !== 'object') return {};
  return Object.fromEntries(Object.entries(body.errors).map(([field, messages]) => [field,
    Array.isArray(messages) ? messages.filter((message): message is string => typeof message === 'string').join(' ') : 'Revisá este campo.',
  ]));
}
