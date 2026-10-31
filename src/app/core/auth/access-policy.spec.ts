import { canAccessGroup, hasDeliveryRole, hasFeedRecipesPermission, hasManagementPlansPermission, isAdminUser, postLoginPath } from './access-policy';
import { AuthUser } from './auth.types';

const user = (roles: string[]): Pick<AuthUser, 'roles'> => ({ roles });

describe('admin access policy', () => {
  it('normalizes the existing ADMIN role and grants all sidebar groups', () => {
    expect(isAdminUser(user([' ADMIN ']))).toBe(true);
    for (const group of ['resumen', 'ubicaciones', 'lotes', 'inventario', 'historial', 'usuarios', 'clientes', 'proveedores', 'unidades-productivas', 'manejo-lotes', 'repartos', 'alertas-notificaciones', 'reportes'] as const) {
      expect(canAccessGroup(user(['admin']), group)).toBe(true);
    }
  });

  it('does not grant uncontracted module access to other roles', () => {
    expect(isAdminUser(user(['employee']))).toBe(false);
    expect(canAccessGroup(user(['employee']), 'usuarios')).toBe(false);
    expect(canAccessGroup(null, 'reportes')).toBe(false);
  });

  it('grants reporting and egg inventory navigation from functional permissions', () => {
    const reader = { roles: ['employee'], permissions: ['reports.view', 'egg-stock.view'] };
    expect(canAccessGroup(reader, 'reportes')).toBe(true);
    expect(canAccessGroup(reader, 'inventario')).toBe(true);
    expect(canAccessGroup(reader, 'usuarios')).toBe(false);
  });

  it('shows only the management plans group for a reader or manager permission', () => {
    const reader = { roles: ['employee'], permissions: ['management-plans.view'] };
    const manager = { roles: ['employee'], permissions: ['management-plans.manage'] };
    expect(canAccessGroup(reader, 'manejo-lotes')).toBe(true);
    expect(canAccessGroup(reader, 'inventario')).toBe(false);
    expect(hasManagementPlansPermission(reader, 'manage')).toBe(false);
    expect(hasManagementPlansPermission(manager, 'view')).toBe(true);
  });

  it('sends delivery-only users to the driver mode and preserves multi-role access', () => {
    expect(hasDeliveryRole(user(['delivery']))).toBe(true);
    expect(postLoginPath(user(['delivery']))).toBe('/repartidor');
    expect(postLoginPath(user(['delivery', 'employee']))).toBe('/repartidor');
    expect(postLoginPath(user(['delivery', 'admin']))).toBe('/administracion');
  });

  it('routes employees to the quick access shell without granting other modules', () => {
    expect(postLoginPath({ roles: ['employee'], permissions: ['reports.view'] })).toBe('/administracion');
    expect(postLoginPath({ roles: ['delivery'], permissions: ['egg-stock.view'] })).toBe('/administracion');
    expect(postLoginPath(user(['employee']))).toBe('/administracion');
    expect(canAccessGroup(user(['employee']), 'acceso-rapido')).toBe(true);
    expect(canAccessGroup(null, 'acceso-rapido')).toBe(false);
    expect(postLoginPath(null)).toBe('/acceso-denegado');
  });

  it('allows recipe navigation without granting unrelated modules or inferring read from manage', () => {
    const reader = { roles: ['employee'], permissions: ['feed-recipes.view'] };
    expect(canAccessGroup(reader, 'manejo-lotes')).toBe(true);
    expect(canAccessGroup(reader, 'inventario')).toBe(false);
    expect(postLoginPath(reader)).toBe('/administracion');
    expect(hasFeedRecipesPermission(reader, 'manage')).toBe(false);
    const manager = { roles: ['employee'], permissions: ['feed-recipes.manage'] };
    expect(canAccessGroup(manager, 'manejo-lotes')).toBe(true);
    expect(hasFeedRecipesPermission(manager, 'view')).toBe(false);
  });
});
