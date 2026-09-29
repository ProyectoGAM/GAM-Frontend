import { canAccessGroup, AdminGroup } from '../../core/auth/access-policy';
import { AuthUser } from '../../core/auth/auth.types';

export interface AdminNavigationGroup {
  id: AdminGroup;
  label: string;
  icon: string;
  section: 'unit' | 'global';
  items: ReadonlyArray<{ label: string; slug: string }>;
}
export const ADMIN_NAVIGATION: readonly AdminNavigationGroup[] = [
  {
    id: 'resumen',
    label: 'Resumen',
    icon: 'grid-outline',
    section: 'unit',
    items: [{ label: 'Resumen', slug: '' }],
  },
  {
    id: 'ubicaciones',
    label: 'Instalaciones',
    icon: 'location-outline',
    section: 'unit',
    items: [
      { label: 'Galpones', slug: 'galpones' },
      { label: 'Plantas de ración', slug: 'plantas-de-racion' },
      { label: 'Crear instalación', slug: 'nuevo-galpon' },
    ],
  },
  {
    id: 'lotes',
    label: 'Lotes',
    icon: 'egg-outline',
    section: 'unit',
    items: [{ label: 'Lotes', slug: 'lotes' }],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: 'cube-outline',
    section: 'unit',
    items: [
      { label: 'Stock de huevos', slug: 'existencias/huevos' },
      { label: 'Existencias', slug: 'existencias' },
      { label: 'Ubicaciones de stock', slug: 'existencias/ubicaciones' },
      { label: 'Movimientos', slug: 'movimientos' },
      { label: 'Ajustes y pérdidas', slug: 'ajustes-y-perdidas' },
    ],
  },
  {
    id: 'historial',
    label: 'Historial',
    icon: 'time-outline',
    section: 'unit',
    items: [{ label: 'Historial', slug: '' }],
  },
  {
    id: 'usuarios',
    label: 'Usuarios',
    icon: 'people-outline',
    section: 'global',
    items: [
      { label: 'Usuarios', slug: 'usuarios' },
      { label: 'Nuevo usuario', slug: 'nuevo-usuario' },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: 'person-outline',
    section: 'global',
    items: [
      { label: 'Clientes', slug: 'clientes' },
      { label: 'Nuevo cliente', slug: 'nuevo-cliente' },
    ],
  },
  {
    id: 'proveedores',
    label: 'Proveedores',
    icon: 'business-outline',
    section: 'global',
    items: [
      { label: 'Proveedores', slug: 'proveedores' },
      { label: 'Productos', slug: 'productos' },
      { label: 'Nuevo producto', slug: 'productos/nuevo' },
    ],
  },
  {
    id: 'unidades-productivas',
    label: 'Unidades productivas',
    icon: 'business-outline',
    section: 'global',
    items: [
      { label: 'Listado', slug: '' },
      { label: 'Crear unidad productiva', slug: 'nueva' },
    ],
  },
  {
    id: 'manejo-lotes',
    label: 'Manejo de Lotes',
    icon: 'clipboard-outline',
    section: 'global',
    items: [
      { label: 'Planes', slug: 'planes' },
      { label: 'Vacunación', slug: 'vacunacion' },
      { label: 'Medicación', slug: 'medicacion' },
      { label: 'Raciones', slug: 'raciones' },
    ],
  },
  {
    id: 'repartos',
    label: 'Repartos',
    icon: 'car-outline',
    section: 'global',
    items: [
      { label: 'Repartos', slug: 'repartos' },
      { label: 'Catálogo y precios', slug: 'catalogo-y-precios' },
    ],
  },
  {
    id: 'alertas-notificaciones',
    label: 'Alertas y notificaciones',
    icon: 'notifications-outline',
    section: 'global',
    items: [
      { label: 'Bandeja de alertas', slug: 'bandeja-de-alertas' },
      { label: 'Configuración de alertas', slug: 'configuracion-de-alertas' },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: 'bar-chart-outline',
    section: 'global',
    items: [{ label: 'Reportes', slug: 'reportes' }],
  },
];

export function adminItemPath(group: AdminNavigationGroup, slug: string): string {
  return `/administracion/${group.id}${slug ? `/${slug}` : ''}`;
}

export function visibleAdminNavigation(user: Pick<AuthUser, 'roles'> | null): readonly AdminNavigationGroup[] {
  return ADMIN_NAVIGATION.filter((group) => canAccessGroup(user, group.id));
}

export function firstVisibleAdminPath(user: Pick<AuthUser, 'roles'> | null): string | null {
  const group = visibleAdminNavigation(user)[0];
  const item = group?.items[0];
  return group && item ? adminItemPath(group, item.slug) : null;
}

export function activeAdminGroup(path: string): AdminGroup | null {
  const groupId = path.split('?')[0]?.split('/')[2];
  if (groupId === 'ubicaciones' && path.split('?')[0]?.split('/')[3] === 'unidades-productivas') {
    return 'unidades-productivas';
  }
  return ADMIN_NAVIGATION.find((group) => group.id === groupId)?.id ?? null;
}
