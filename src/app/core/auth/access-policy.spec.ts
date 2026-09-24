import { canAccessGroup, isAdminUser } from './access-policy';
import { AuthUser } from './auth.types';

const user = (roles: string[]): Pick<AuthUser, 'roles'> => ({ roles });

describe('admin access policy', () => {
  it('normalizes the existing ADMIN role and grants all ten groups', () => {
    expect(isAdminUser(user([' ADMIN ']))).toBe(true);
    for (const group of ['usuarios', 'ubicaciones', 'lotes', 'manejo-lotes', 'proveedores', 'clientes', 'ventas-repartos', 'inventario', 'alertas-notificaciones', 'reportes'] as const) {
      expect(canAccessGroup(user(['admin']), group)).toBe(true);
    }
  });

  it('does not grant uncontracted module access to other roles', () => {
    expect(isAdminUser(user(['employee']))).toBe(false);
    expect(canAccessGroup(user(['employee']), 'usuarios')).toBe(false);
    expect(canAccessGroup(null, 'reportes')).toBe(false);
  });
});
