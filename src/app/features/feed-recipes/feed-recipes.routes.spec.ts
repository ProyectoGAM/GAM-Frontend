import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { feedRecipesRoutes } from './feed-recipes.routes';
import { adminRoutes } from '../admin/admin.routes';

describe('Feed recipe routes', () => {
  it('lazy-loads the existing capitalized sidebar path and keeps creation before numeric detail', async () => {
    const group = adminRoutes[0]?.children?.find((route) => route.path === 'manejo-lotes');
    const entry = group?.children?.find((route) => route.path === 'Recetas');
    expect(entry?.loadChildren).toBeTypeOf('function');
    expect(feedRecipesRoutes.map((route) => route.path)).toEqual(['', 'nueva', ':id']);
    expect(feedRecipesRoutes.every((route) => typeof route.loadComponent === 'function')).toBe(true);
  });

  it('uses the contracted view and manage grants independently for detail and the creation entry', () => {
    const user = { id: 1, permissions: ['feed-recipes.view'] };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthStore, useValue: { user: () => user, isAdmin: () => false } }] });
    const evaluate = (index: number) => TestBed.runInInjectionContext(() => (feedRecipesRoutes[index].canActivate![0] as CanActivateFn)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect(evaluate(2)).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(evaluate(1) as UrlTree)).toBe('/acceso-denegado');
    user.permissions = ['feed-recipes.manage'];
    expect(evaluate(1)).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(evaluate(2) as UrlTree)).toBe('/acceso-denegado');
  });
});
