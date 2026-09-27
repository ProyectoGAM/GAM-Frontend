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

export function canAccessGroup(user: Pick<AuthUser, 'roles'> | null, group: AdminGroup): boolean {
  if (isAdminUser(user)) return true;
  const roles = normalizedRoles(user);
  return GROUP_ROLE_GRANTS[group].some((role) => roles.has(role.trim().toLocaleLowerCase()));
}
