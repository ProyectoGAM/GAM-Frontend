import { activeAdminGroup, firstVisibleAdminPath, visibleAdminNavigation } from './admin-navigation';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { adminIndexRedirect } from './admin-index.redirect';

describe('admin navigation visibility', () => {
  it('shows all thirteen groups to ADMIN and none to a role without grants', () => {
    expect(visibleAdminNavigation({ roles: ['admin'] })).toHaveLength(13);
    expect(visibleAdminNavigation({ roles: ['employee'] })).toHaveLength(0);
    expect(visibleAdminNavigation(null)).toHaveLength(0);
  });

  it('keeps UP modules before global modules in the requested order', () => {
    const navigation = visibleAdminNavigation({ roles: ['admin'] });
    expect(navigation.map((group) => group.label)).toEqual([
      'Resumen', 'Instalaciones', 'Lotes', 'Inventario', 'Historial',
      'Usuarios', 'Clientes', 'Proveedores', 'Unidades productivas',
      'Manejo de Lotes', 'Repartos', 'Alertas y notificaciones', 'Reportes',
    ]);
    expect(navigation.map((group) => group.section)).toEqual([
      'unit', 'unit', 'unit', 'unit', 'unit',
      'global', 'global', 'global', 'global', 'global', 'global', 'global', 'global',
    ]);
    expect(navigation.find((group) => group.id === 'ubicaciones')?.items.map((item) => item.slug))
      .toEqual(['galpones', 'plantas-de-racion', 'nuevo-galpon']);
    expect(navigation.find((group) => group.id === 'unidades-productivas')?.items.map((item) => item.slug))
      .toEqual(['', 'nueva']);
  });

  it('routes the panel entry to the first group and item the user can see', () => {
    expect(firstVisibleAdminPath({ roles: ['admin'] })).toBe('/administracion/resumen');
    expect(firstVisibleAdminPath({ roles: ['employee'] })).toBeNull();
  });

  it('finds the group for a direct route after reload, including query parameters', () => {
    expect(activeAdminGroup('/administracion/unidades-productivas')).toBe('unidades-productivas');
    expect(activeAdminGroup('/administracion/ubicaciones/unidades-productivas')).toBe('unidades-productivas');
    expect(activeAdminGroup('/administracion/repartos/repartos')).toBe('repartos');
    expect(activeAdminGroup('/administracion/inventario/existencias?page=2')).toBe('inventario');
    expect(activeAdminGroup('/auth')).toBeNull();
  });

  it('redirects the empty panel URL to the first visible route', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { user: () => ({ roles: ['admin'] }) } }],
    });
    const result = TestBed.runInInjectionContext(() => adminIndexRedirect({} as ActivatedRouteSnapshot));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['parseUrl']>))
      .toBe('/administracion/resumen');
  });
});
