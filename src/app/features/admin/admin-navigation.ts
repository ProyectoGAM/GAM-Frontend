import { adminGroupSection, canAccessAdminItem, AdminGroup, AdminUser } from '../../core/auth/access-policy';

export interface AdminNavigationGroup {
  id: AdminGroup;
  label: string;
  icon: string;
  section: 'unit' | 'global';
  items: ReadonlyArray<{ label: string; slug: string }>;
}
const navigation: readonly Omit<AdminNavigationGroup, 'section'>[] = [
  {
    id: 'acceso-rapido',
    label: 'Acceso rápido',
    icon: 'flash-outline',
    items: [{ label: 'Acceso rápido', slug: '' }],
  },
  {
    id: 'resumen',
    label: 'Resumen',
    icon: 'grid-outline',
    items: [{ label: 'Resumen', slug: '' }],
  },
  {
    id: 'ubicaciones',
    label: 'Instalaciones',
    icon: 'location-outline',
    items: [
      { label: 'Galpones', slug: 'galpones' },
      { label: 'Plantas de ración', slug: 'plantas-de-racion' },
      { label: 'Mantenimiento', slug: 'mantenimiento' },
      { label: 'Crear instalación', slug: 'nuevo-galpon' },
    ],
  },
  {
    id: 'lotes',
    label: 'Lotes',
    icon: 'egg-outline',
    items: [{ label: 'Lotes', slug: 'lotes' }],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: 'cube-outline',
    items: [
      { label: 'Existencias', slug: 'existencias' },
      { label: 'Presentaciones y precios', slug: 'presentaciones-huevos' },
      { label: 'Ubicaciones de stock', slug: 'existencias/ubicaciones' },
      { label: 'Donaciones', slug: 'donaciones' },
      { label: 'Movimientos', slug: 'movimientos' },
      { label: 'Registrar movimiento', slug: 'ajustes-y-perdidas' },
    ],
  },
  {
    id: 'historial',
    label: 'Historial',
    icon: 'time-outline',
    items: [{ label: 'Historial', slug: '' }],
  },
  {
    id: 'usuarios',
    label: 'Usuarios',
    icon: 'people-outline',
    items: [
      { label: 'Usuarios', slug: '' },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: 'person-outline',
    items: [
      { label: 'Clientes', slug: 'clientes' },
      { label: 'Nuevo cliente', slug: 'nuevo-cliente' },
    ],
  },
  {
    id: 'proveedores',
    label: 'Proveedores',
    icon: 'storefront-outline',
    items: [
      { label: 'Proveedores', slug: 'proveedores' },
    ],
  },
  {
    id: 'unidades-productivas',
    label: 'Unidades productivas',
    icon: 'business-outline',
    items: [
      { label: 'Listado', slug: '' },
      { label: 'Crear unidad productiva', slug: 'nueva' },
    ],
  },
  {
    id: 'manejo-lotes',
    label: 'Manejo de Lotes',
    icon: 'clipboard-outline',
    items: [
      { label: 'Planes', slug: 'planes' },
      { label: 'Vacunación', slug: 'vacunacion' },
      { label: 'Medicación', slug: 'medicacion' },
      { label: 'Recetas', slug: 'Recetas' },
      { label: 'Razas', slug: 'razas' },
    ],
  },
  {
    id: 'repartos',
    label: 'Repartos',
    icon: 'map-outline',
    items: [
      { label: 'Repartos', slug: 'repartos' },

    ],
  },
  {
    id: 'vehiculos',
    label: 'Vehículos',
    icon: 'car-outline',
    items: [{ label: 'Flota', slug: '' }],
  },
  {
    id: 'alertas-notificaciones',
    label: 'Alertas y notificaciones',
    icon: 'notifications-outline',
    items: [
      { label: 'Bandeja de alertas', slug: 'bandeja-de-alertas' },
      { label: 'Configuración de alertas', slug: 'configuracion-de-alertas' },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: 'bar-chart-outline',
    items: [{ label: 'Reportes', slug: 'reportes' }],
  },
];

export const ADMIN_NAVIGATION: readonly AdminNavigationGroup[] = navigation.map((group) => ({
  ...group,
  section: adminGroupSection(group.id),
}));

export function adminItemPath(group: AdminNavigationGroup, slug: string): string {
  return `/administracion/${group.id}${slug ? `/${slug}` : ''}`;
}

export function visibleAdminNavigation(user: AdminUser | null): readonly AdminNavigationGroup[] {
  return ADMIN_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessAdminItem(user, group.id, item.slug)),
  })).filter((group) => group.items.length > 0);
}

export function firstVisibleAdminPath(user: AdminUser | null): string | null {
  const group = visibleAdminNavigation(user)[0];
  const item = group?.items[0];
  return group && item ? adminItemPath(group, item.slug) : null;
}

export function activeAdminGroup(path: string): AdminGroup | null {
  const segments = path.split(/[?#]/)[0]?.split('/') ?? [];
  const groupId = segments[2];
  const isLegacyUnitRoute = groupId === 'ubicaciones' && segments[3] === 'unidades-productivas';
  if (groupId === 'unidades-productivas' || isLegacyUnitRoute) {
    const unitIndex = isLegacyUnitRoute ? 4 : 3;
    if (segments[unitIndex + 1] === 'galpon' && segments[unitIndex + 2]) {
      return 'ubicaciones';
    }
    return 'unidades-productivas';
  }
  return ADMIN_NAVIGATION.find((group) => group.id === groupId)?.id ?? null;
}
