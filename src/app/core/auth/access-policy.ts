import { AuthUser } from './auth.types';

export const ADMIN_GROUP_IDS = [
  'acceso-rapido', 'resumen', 'ubicaciones', 'lotes', 'inventario', 'historial',
  'usuarios', 'clientes', 'proveedores', 'unidades-productivas',
  'manejo-lotes', 'repartos', 'vehiculos', 'alertas-notificaciones', 'reportes',
] as const;

export type AdminGroup = typeof ADMIN_GROUP_IDS[number];

/** Backend permission strings are not yet contracted; keep grants empty until they are. */
export const GROUP_ROLE_GRANTS: Readonly<Record<AdminGroup, readonly string[]>> = {
  'acceso-rapido': [],
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
  vehiculos: [],
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

export function postLoginPath(user: (Pick<AuthUser, 'roles'> & Partial<Pick<AuthUser, 'permissions'>>) | null): string {
  if (hasDeliveryRole(user) && !ADMIN_GROUP_IDS.some((group) => group !== 'acceso-rapido' && canAccessGroup(user, group))) return '/repartidor';
  if (ADMIN_GROUP_IDS.some((group) => canAccessGroup(user, group))) return '/administracion';
  if (hasDeliveryRole(user)) return '/repartidor';
  return '/acceso-denegado';
}

export function hasManagementPlansPermission(user: (Pick<AuthUser, 'roles'> & Partial<Pick<AuthUser, 'permissions'>>) | null, permission: 'view' | 'manage'): boolean {
  const permissions = new Set((user?.permissions ?? []).map((value) => value.trim().toLowerCase()));
  return permissions.has(`management-plans.${permission}`)
    || (permission === 'view' && permissions.has('management-plans.manage'));
}

export function hasFeedRecipesPermission(user: Partial<Pick<AuthUser, 'permissions'>> | null, permission: 'view' | 'manage'): boolean {
  return user?.permissions?.includes(`feed-recipes.${permission}`) === true;
}

export function canAccessGroup(user: (Pick<AuthUser, 'roles'> & Partial<Pick<AuthUser, 'permissions'>>) | null, group: AdminGroup): boolean {
  // The landing page does not grant permission to any of its underlying operations.
  if (group === 'acceso-rapido') return user !== null;
  if (isAdminUser(user)) return true;
  if (group === 'manejo-lotes' && hasManagementPlansPermission(user, 'view')) return true;
  if (group === 'manejo-lotes' && (hasFeedRecipesPermission(user, 'view') || hasFeedRecipesPermission(user, 'manage'))) return true;
  if (group === 'clientes' && user?.permissions?.some((permission) => ['customers.view', 'customers.manage'].includes(permission))) return true;
  if (group === 'vehiculos' && user?.permissions?.some((permission) => ['vehicles.view', 'vehicles.manage', 'vehicles.use', 'vehicles.readings.manage', 'vehicles.fuel.view', 'vehicles.fuel.manage', 'vehicles.maintenance.view', 'vehicles.maintenance.manage', 'vehicles.documents.view', 'vehicles.documents.manage'].includes(permission))) return true;
  if (group === 'reportes' && user?.permissions?.includes('reports.view')) return true;
  if (group === 'inventario' && user?.permissions?.some((permission) => ['inventory.view', 'egg-stock.view', 'egg-stock.move', 'products.view', 'products.manage', 'management-plans.manage'].includes(permission))) return true;
  const roles = normalizedRoles(user);
  return GROUP_ROLE_GRANTS[group].some((role) => roles.has(role.trim().toLocaleLowerCase()));
}
