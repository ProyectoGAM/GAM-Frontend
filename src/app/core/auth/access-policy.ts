import { AuthUser } from './auth.types';
import { hasAnyPermission } from './permission-keys';

const unitGroups = [
  'acceso-rapido', 'resumen', 'ubicaciones', 'lotes', 'inventario', 'historial',
] as const;

const globalGroups = [
  'usuarios', 'clientes', 'proveedores', 'unidades-productivas',
  'manejo-lotes', 'repartos', 'vehiculos', 'alertas-notificaciones', 'reportes',
] as const;

export const ADMIN_GROUP_IDS = [...unitGroups, ...globalGroups] as const;
export type AdminGroup = typeof ADMIN_GROUP_IDS[number];

export type AdminUser = Pick<AuthUser, 'roles'> & Partial<Pick<AuthUser, 'permissions' | 'up_id'>>;

export function adminGroupSection(group: AdminGroup): 'unit' | 'global' {
  return globalGroups.some((globalGroup) => globalGroup === group) ? 'global' : 'unit';
}

const productRead = ['can_view_products', 'can_manage_products', 'can_manage_management_plans'];
const inventoryRead = ['can_view_inventory'];
const houseRead = ['can_view_poultry_houses'];

const adminItems: Readonly<Record<AdminGroup, Readonly<Record<string, readonly string[]>>>> = {
  'acceso-rapido': { '': [] },
  resumen: { '': ['can_view_admin_dashboard'] },
  ubicaciones: {
    galpones: houseRead,
    'plantas-de-racion': houseRead,
    mantenimiento: houseRead,
    'nuevo-galpon': ['can_manage_poultry_houses'],
    'unidades-productivas': ['can_view_production_units'],
    'nueva-unidad-productiva': ['can_manage_production_units'],
  },
  lotes: { lotes: ['can_view_flocks'] },
  inventario: {
    existencias: [...inventoryRead, 'can_view_egg_stock', 'can_view_feed_stock', ...productRead],
    'existencias/ubicaciones': inventoryRead,
    'existencias/productos': productRead,
    'existencias/productos/nuevo': ['can_manage_products'],
    'existencias/huevos': ['can_view_egg_stock'],
    'existencias/raciones': ['can_view_feed_stock'],
    'presentaciones-huevos': [],
    donaciones: ['can_view_egg_stock', 'can_move_egg_stock'],
    movimientos: inventoryRead,
    'ajustes-y-perdidas': ['can_move_inventory', 'can_adjust_inventory'],
  },
  historial: { '': ['can_view_audit'] },
  usuarios: { '': ['can_manage_users'], crear: [], dispositivos: [], roles: [] },
  clientes: { clientes: ['can_view_customers', 'can_manage_customers'], 'nuevo-cliente': ['can_manage_customers'] },
  proveedores: { proveedores: ['can_view_suppliers'] },
  'unidades-productivas': { '': ['can_view_production_units'], nueva: ['can_manage_production_units'] },
  'manejo-lotes': {
    planes: ['can_view_management_plans', 'can_manage_management_plans'],
    vacunacion: ['can_manage_management_plans'],
    medicacion: ['can_manage_management_plans'],
    Recetas: ['can_view_feed_recipes', 'can_manage_feed_recipes'],
    razas: ['can_view_breeds'],
  },
  repartos: { repartos: ['can_view_delivery_history', 'can_monitor_deliveries'] },
  vehiculos: { '': [
    'can_view_vehicles', 'can_manage_vehicles', 'can_use_vehicles', 'can_manage_vehicle_readings',
    'can_view_vehicle_fuel', 'can_manage_vehicle_fuel', 'can_view_vehicle_maintenance',
    'can_manage_vehicle_maintenance', 'can_view_vehicle_documents', 'can_manage_vehicle_documents',
  ] },
  'alertas-notificaciones': { 'bandeja-de-alertas': [], 'configuracion-de-alertas': ['can_manage_alert_thresholds'] },
  reportes: { reportes: ['can_view_reports'] },
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

export function postLoginPath(user: AdminUser | null): string {
  if (hasDeliveryRole(user) && !ADMIN_GROUP_IDS.some((group) => group !== 'acceso-rapido' && canAccessGroup(user, group))) return '/repartidor';
  if (ADMIN_GROUP_IDS.some((group) => canAccessGroup(user, group))) return '/administracion';
  if (hasDeliveryRole(user)) return '/repartidor';
  return '/acceso-denegado';
}

export function hasManagementPlansPermission(user: AdminUser | null, permission: 'view' | 'manage'): boolean {
  const permissions = user?.permissions?.map((key) => key.trim().toLowerCase());
  return isAdminUser(user) || hasAnyPermission(permissions, 'can_manage_management_plans')
    || (permission === 'view' && hasAnyPermission(permissions, 'can_view_management_plans'));
}

export function hasFeedRecipesPermission(user: Partial<Pick<AuthUser, 'permissions'>> | null, permission: 'view' | 'manage'): boolean {
  return hasAnyPermission(user?.permissions, `can_${permission}_feed_recipes`);
}

export function canCreateFlockFromQuickAccess(user: Pick<AuthUser, 'roles' | 'permissions'> | null): boolean {
  if (isAdminUser(user)) return true;
  const permissions = new Set(user?.permissions ?? []);
  return [
    'can_manage_flocks', 'can_view_flocks', 'can_view_production_units',
    'can_view_poultry_houses', 'can_view_breeds', 'can_view_suppliers',
  ].every((permission) => permissions.has(permission))
    && (permissions.has('can_view_management_plans') || permissions.has('can_manage_management_plans'));
}

export function canAccessAdminItem(user: AdminUser | null, group: AdminGroup, slug: string): boolean {
  if (!user) return false;
  if (user.up_id != null) {
    if (adminGroupSection(group) === 'global') return false;
    if (group === 'ubicaciones' && ['unidades-productivas', 'nueva-unidad-productiva'].includes(slug)) return false;
  }
  // Quick Access is a landing page. Its operations check their own permissions.
  if (group === 'acceso-rapido' || isAdminUser(user)) return true;
  if (group === 'ubicaciones' && !hasAnyPermission(user.permissions, 'can_view_production_units')) return false;
  const items = adminItems[group];
  return Object.hasOwn(items, slug) && hasAnyPermission(user.permissions, ...items[slug]);
}

export function canAccessGroup(user: AdminUser | null, group: AdminGroup): boolean {
  return Object.keys(adminItems[group]).some((slug) => canAccessAdminItem(user, group, slug));
}

export function canAccessAdminPath(user: AdminUser | null, group: AdminGroup, path: string): boolean {
  if (user?.up_id != null) {
    // Operational links share URLs with these global modules.
    const legacyUnitPrefix = 'unidades-productivas/';
    const unitPath = group === 'unidades-productivas' ? path
      : group === 'ubicaciones' && path.startsWith(legacyUnitPrefix) ? path.slice(legacyUnitPrefix.length) : null;
    if (unitPath !== null) {
      const [unitId, ...detail] = unitPath.split('/');
      const admin = isAdminUser(user);
      if (unitId !== String(user.up_id) || !(admin || hasAnyPermission(user.permissions, 'can_view_production_units'))) return false;
      if (detail.length === 0) return true;
      if (detail.join('/') === 'editar') return admin || hasAnyPermission(user.permissions, 'can_manage_production_units');
      return /^galpon\/\d+(?:\/(?:editar|elaborar|mantenimientos))?$/.test(detail.join('/'))
        && (admin || hasAnyPermission(user.permissions, ...houseRead));
    }
    if (group === 'manejo-lotes' && /^planes\/lotes\/[^/]+$/.test(path)) {
      return canAccessAdminItem(user, 'lotes', 'lotes') && hasManagementPlansPermission(user, 'view');
    }
  }
  const slug = Object.keys(adminItems[group])
    .filter((item) => item && (path === item || path.startsWith(item + '/')))
    .sort((left, right) => right.length - left.length)[0] ?? '';
  return canAccessAdminItem(user, group, slug);
}
