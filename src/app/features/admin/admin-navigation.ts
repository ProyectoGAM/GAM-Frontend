import { canAccessGroup, AdminGroup } from '../../core/auth/access-policy';
import { AuthUser } from '../../core/auth/auth.types';

export interface AdminNavigationGroup {
  id: AdminGroup;
  label: string;
  icon: string;
  items: ReadonlyArray<{ label: string; slug: string }>;
}

export const ADMIN_NAVIGATION: readonly AdminNavigationGroup[] = [
  { id: 'usuarios', label: 'Usuarios', icon: 'people-outline', items: [{ label: 'Usuarios', slug: 'usuarios' }, { label: 'Nuevo usuario', slug: 'nuevo-usuario' }] },
  { id: 'ubicaciones', label: 'Ubicaciones', icon: 'location-outline', items: [{ label: 'Unidades productivas', slug: 'unidades-productivas' }, { label: 'Crear unidad productiva', slug: 'nueva-unidad-productiva' }, { label: 'Galpones', slug: 'galpones' }, { label: 'Plantas de ración', slug: 'plantas-de-racion' }, { label: 'Crear galpón', slug: 'nuevo-galpon' }] },
  { id: 'lotes', label: 'Lotes', icon: 'egg-outline', items: [{ label: 'Lotes', slug: 'lotes' }] },
  { id: 'manejo-lotes', label: 'Manejo de Lotes', icon: 'clipboard-outline', items: [{ label: 'Planes', slug: 'planes' }, { label: 'Vacunación', slug: 'vacunacion' }, { label: 'Medicación', slug: 'medicacion' }, { label: 'Raciones', slug: 'raciones' }] },
  { id: 'proveedores', label: 'Proveedores', icon: 'business-outline', items: [{ label: 'Proveedores', slug: 'proveedores' }, { label: 'Nuevo proveedor', slug: 'nuevo-proveedor' }] },
  { id: 'clientes', label: 'Clientes', icon: 'person-outline', items: [{ label: 'Clientes', slug: 'clientes' }, { label: 'Nuevo cliente', slug: 'nuevo-cliente' }] },
  { id: 'repartos', label: 'Repartos', icon: 'car-outline', items: [{ label: 'Repartos', slug: 'repartos' }, { label: 'Catálogo y precios', slug: 'catalogo-y-precios' }] },
  { id: 'inventario', label: 'Inventario', icon: 'cube-outline', items: [{ label: 'Existencias', slug: 'existencias' }, { label: 'Movimientos', slug: 'movimientos' }, { label: 'Donaciones', slug: 'donaciones' }, { label: 'Ajustes y pérdidas', slug: 'ajustes-y-perdidas' }] },
  { id: 'alertas-notificaciones', label: 'Alertas y notificaciones', icon: 'notifications-outline', items: [{ label: 'Bandeja de alertas', slug: 'bandeja-de-alertas' }, { label: 'Configuración de alertas', slug: 'configuracion-de-alertas' }] },
  { id: 'reportes', label: 'Reportes', icon: 'bar-chart-outline', items: [{ label: 'Reportes', slug: 'reportes' }] },
];

export function visibleAdminNavigation(user: Pick<AuthUser, 'roles'> | null): readonly AdminNavigationGroup[] {
  return ADMIN_NAVIGATION.filter((group) => canAccessGroup(user, group.id));
}

export function firstVisibleAdminPath(user: Pick<AuthUser, 'roles'> | null): string | null {
  const group = visibleAdminNavigation(user)[0];
  const item = group?.items[0];
  return group && item ? `/administracion/${group.id}/${item.slug}` : null;
}

export function activeAdminGroup(path: string): AdminGroup | null {
  const groupId = path.split('?')[0]?.split('/')[2];
  return ADMIN_NAVIGATION.find((group) => group.id === groupId)?.id ?? null;
}
