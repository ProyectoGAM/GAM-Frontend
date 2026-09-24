import { firstVisibleAdminPath, visibleAdminNavigation } from './admin-navigation';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { adminIndexRedirect } from './admin-index.redirect';

describe('admin navigation visibility', () => {
  it('shows all ten groups to ADMIN and none to a role without grants', () => {
    expect(visibleAdminNavigation({ roles: ['admin'] })).toHaveLength(10);
    expect(visibleAdminNavigation({ roles: ['employee'] })).toHaveLength(0);
    expect(visibleAdminNavigation(null)).toHaveLength(0);
  });

  it('keeps the requested order and 25 entries', () => {
    const navigation = visibleAdminNavigation({ roles: ['admin'] });
    expect(navigation.map((group) => group.label)).toEqual([
      'Usuarios', 'Ubicaciones', 'Lotes', 'Manejo de Lotes', 'Proveedores',
      'Clientes', 'Ventas y repartos', 'Inventario', 'Alertas y notificaciones', 'Reportes',
    ]);
    expect(navigation.reduce((count, group) => count + group.items.length, 0)).toBe(25);
  });

  it('routes the panel entry to the first group and item the user can see', () => {
    expect(firstVisibleAdminPath({ roles: ['admin'] })).toBe('/administracion/usuarios/usuarios');
    expect(firstVisibleAdminPath({ roles: ['employee'] })).toBeNull();
  });

  it('redirects the empty panel URL to the first visible route', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { user: () => ({ roles: ['admin'] }) } }],
    });
    const result = TestBed.runInInjectionContext(() => adminIndexRedirect({} as ActivatedRouteSnapshot));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['parseUrl']>))
      .toBe('/administracion/usuarios/usuarios');
  });
});
