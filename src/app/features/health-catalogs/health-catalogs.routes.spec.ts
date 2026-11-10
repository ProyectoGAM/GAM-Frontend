import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot, UrlTree, provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { adminRoutes } from '../admin/admin.routes';
import { medicationRoutes, vaccinationRoutes } from './health-catalogs.routes';
describe('Health catalog routes', () => {
  it('replaces the existing placeholders with lazy catalog routes and full-page creation', () => {
    const routes = adminRoutes[0].children?.find((route) => route.path === 'manejo-lotes')?.children;
    expect(routes?.find((route) => route.path === 'vacunacion')?.loadChildren).toBeTypeOf('function');
    expect(routes?.find((route) => route.path === 'medicacion')?.loadChildren).toBeTypeOf('function');
    expect(vaccinationRoutes.map((route) => route.path)).toEqual(['', 'nuevo', ':id']);
    expect(medicationRoutes.map((route) => route.path)).toEqual(['', 'nuevo']);
    expect(vaccinationRoutes[1].canDeactivate).toHaveLength(1);
  });
  it('allows plan managers to read the catalog and reserves creation for administrators', () => {
    let admin = false;
    let permissions = ['can_view_management_plans'];
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { isAdmin: () => admin, user: () => ({ roles: ['employee'], permissions }) } },
    ] });
    const evaluate = (index: number) => TestBed.runInInjectionContext(() => (vaccinationRoutes[index].canActivate![0] as CanActivateFn)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect(TestBed.inject(Router).serializeUrl(evaluate(0) as UrlTree)).toBe('/acceso-denegado');
    permissions = ['can_manage_management_plans'];
    expect(evaluate(0)).toBe(true);
    expect(evaluate(2)).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(evaluate(1) as UrlTree)).toBe('/acceso-denegado');
    admin = true; expect(evaluate(0)).toBe(true); expect(evaluate(1)).toBe(true); expect(evaluate(2)).toBe(true);
  });
});
