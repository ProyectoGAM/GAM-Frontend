import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthStore } from '../auth/auth.store';
import { adminGroupChildGuard, adminGroupGuard } from './admin-group.guard';

@Component({ template: '' })
class GuardTestPage {}

describe('adminGroupGuard', () => {
  it('denies a direct module URL to an authenticated user without a contracted group role', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { whenReady: async () => undefined, isAuthenticated: () => true, user: () => ({ roles: ['employee'] }) } },
      ],
    });
    const route = { data: { group: 'usuarios' }, children: [] } as unknown as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() => adminGroupGuard(route, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['parseUrl']>)).toBe('/acceso-denegado');
  });

  it('redirects a guest directly to sign in', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { whenReady: async () => undefined, isAuthenticated: () => false, user: () => null } },
      ],
    });
    const route = { data: { group: 'usuarios' }, children: [] } as unknown as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() => adminGroupGuard(route, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['parseUrl']>)).toBe('/auth');
  });

  it('allows the existing admin role to open a module URL', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { whenReady: async () => undefined, isAuthenticated: () => true, user: () => ({ roles: ['admin'] }) } },
      ],
    });
    const route = { data: { group: 'usuarios' }, children: [] } as unknown as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() => adminGroupGuard(route, {} as never));
    expect(result).toBe(true);
  });

  it('does not grant admin group access from management-plans.manage alone', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { whenReady: async () => undefined, isAuthenticated: () => true, user: () => ({ roles: ['manager'], permissions: ['management-plans.manage'] }) } },
      ],
    });
    const route = { data: { group: 'proveedores' }, children: [] } as unknown as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() => adminGroupGuard(route, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['parseUrl']>)).toBe('/acceso-denegado');
  });

  it('allows scoped operational details but denies global pages, even from the same group', async () => {
    const guarded = { canActivate: [adminGroupGuard], canActivateChild: [adminGroupChildGuard] };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'acceso-denegado', component: GuardTestPage },
          { path: 'administracion', children: [
            { path: 'unidades-productivas', ...guarded, data: { group: 'unidades-productivas' }, children: [
              { path: '', children: [
                { path: '', component: GuardTestPage },
                { path: ':id/galpon/:houseId', component: GuardTestPage },
              ] },
            ] },
            { path: 'manejo-lotes', ...guarded, data: { group: 'manejo-lotes' }, children: [
              { path: 'planes', children: [
                { path: 'lotes/:id', component: GuardTestPage },
                { path: 'plantillas', component: GuardTestPage },
              ] },
            ] },
            { path: 'ubicaciones', ...guarded, data: { group: 'ubicaciones' }, children: [
              { path: 'unidades-productivas', component: GuardTestPage },
            ] },
          ] },
        ]),
        { provide: AuthStore, useValue: {
          whenReady: async () => undefined,
          isAuthenticated: () => true,
          user: () => ({ roles: ['employee'], up_id: 7, permissions: [
            'can_view_production_units', 'can_view_poultry_houses', 'can_view_flocks', 'can_manage_management_plans',
          ] }),
        } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    for (const [path, allowed] of [
      ['unidades-productivas/7/galpon/22', true],
      ['unidades-productivas/8/galpon/22', false],
      ['unidades-productivas', false],
      ['ubicaciones/unidades-productivas', false],
      ['manejo-lotes/planes/lotes/lot-1?from=flock', true],
      ['manejo-lotes/planes/plantillas', false],
    ] as const) {
      const url = `/administracion/${path}`;
      await harness.navigateByUrl(url);
      expect(router.url).toBe(allowed ? url : '/acceso-denegado');
    }
  });
});
