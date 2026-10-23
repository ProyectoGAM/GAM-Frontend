import { HttpErrorResponse } from '@angular/common/http';

import { ManagedRole } from '../types/managed-role.type';

// Allowed identifiers come from CreateManagedUserRequest / UpdateUserRolesRequest.
export const MANAGED_ROLES: readonly { id: ManagedRole; label: string; description: string }[] = [
  { id: 'admin', label: 'Administrador', description: 'Rol administrativo del sistema.' },
  { id: 'employee', label: 'Empleado', description: 'Cuenta para tareas operativas autorizadas.' },
  { id: 'delivery', label: 'Repartidor', description: 'Cuenta para operaciones de reparto.' },
];

export function managedRoleLabel(role: string): string {
  return MANAGED_ROLES.find((item) => item.id === role)?.label ?? role;
}

export function isManagedRole(role: string): role is ManagedRole {
  return MANAGED_ROLES.some((item) => item.id === role);
}

export function userManagementError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Sin conexión. Revisá la conexión e intentá nuevamente.';
  if (error.status === 401) return 'La sesión ya no está disponible. Volvé a ingresar.';
  if (error.status === 403) return 'No tenés permiso para realizar esta acción o necesitás confirmar nuevamente tu contraseña.';
  if (error.status === 419) return 'La sesión de seguridad venció. Volvé a ingresar e intentá nuevamente.';
  if (error.status === 429) return 'Hay demasiados intentos. Esperá un momento antes de volver a intentar.';
  if (error.status === 404) return 'La cuenta o el dispositivo ya no está disponible. Actualizá la lista.';
  if (error.status === 422) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'errors' in body && body.errors && typeof body.errors === 'object') {
      const messages = Object.values(body.errors).flatMap((value: unknown) => Array.isArray(value)
        ? value.filter((message: unknown): message is string => typeof message === 'string') : []);
      if (messages.length) return messages.join(' ');
    }
    return 'Revisá los datos del formulario. No se pudo aplicar el cambio.';
  }
  return fallback;
}
