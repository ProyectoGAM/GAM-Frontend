import { AuthUser } from './auth.types';

export const ADMIN_GROUP_IDS = [
  'resumen', 'ubicaciones', 'lotes', 'inventario', 'historial',
  'usuarios', 'clientes', 'proveedores', 'unidades-productivas',
  'manejo-lotes', 'repartos', 'alertas-notificaciones', 'reportes',
] as const;

export type AdminGroup = typeof ADMIN_GROUP_IDS[number];

/** Backend permission strings are not yet contracted; keep grants empty until they are. */
export const GROUP_ROLE_GRANTS: Readonly<Record<AdminGroup, readonly string[]>> = {
  resumen: [],
  usuarios: [],
  ubicaciones: [],
  lotes: [],
  inventario: [],
  historial: [],
  'manejo-lotes': [],
  proveedores: [],
  clientes: [],
  'unidades-productivas': [],
  'repartos': [],
  'alertas-notificaciones': [],
  reportes: [],
};

export function normalizedRoles(user: Pick<AuthUser, 'roles'> | null): ReadonlySet<string> {
  return new Set((user?.roles ?? []).map((role) => role.trim().toLocaleLowerCase()).filter(Boolean));
}

export function isAdminUser(user: Pick<AuthUser, 'roles'> | null): boolean {
  return normalizedRoles(user).has('admin');
}

export function hasDeliveryRole(user: Pick<AuthUser, 'roles'> | null): boolean {
  return normalizedRoles(user).has('delivery');
}

export function postLoginPath(user: Pick<AuthUser, 'roles'> | null): string {
  const roles = normalizedRoles(user);

  if (roles.has('delivery') && roles.size === 1) return '/repartidor';

  return isAdminUser(user) ? '/administracion' : '/home';
}

export function hasManagementPlansPermission(user: (Pick<AuthUser, 'roles'> & Partial<Pick<AuthUser, 'permissions'>>) | null, permission: 'view' | 'manage'): boolean {
  const permissions = new Set((user?.permissions ?? []).map((value) => value.trim().toLowerCase()));
  return permissions.has(`management-plans.${permission}`)
    || (permission === 'view' && permissions.has('management-plans.manage'));
}

export function canAccessGroup(user: (Pick<AuthUser, 'roles'> & Partial<Pick<AuthUser, 'permissions'>>) | null, group: AdminGroup): boolean {
  if (isAdminUser(user)) return true;
  if (group === 'manejo-lotes' && hasManagementPlansPermission(user, 'view')) return true;
  const roles = normalizedRoles(user);
  return GROUP_ROLE_GRANTS[group].some((role) => roles.has(role.trim().toLocaleLowerCase()));
}
