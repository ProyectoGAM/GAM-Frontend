import { canAccessGroup, hasDeliveryRole, hasManagementPlansPermission, isAdminUser, postLoginPath } from './access-policy';
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
    expect(postLoginPath(user(['delivery', 'employee']))).toBe('/home');
    expect(postLoginPath(user(['delivery', 'admin']))).toBe('/administracion');
  });
});
