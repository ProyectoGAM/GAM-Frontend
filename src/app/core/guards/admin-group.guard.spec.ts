import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { adminGroupGuard } from './admin-group.guard';

describe('adminGroupGuard', () => {
  it('denies a direct module URL to an authenticated user without a contracted group role', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { whenReady: async () => undefined, isAuthenticated: () => true, user: () => ({ roles: ['employee'] }) } },
      ],
    });
    const route = { data: { group: 'usuarios' } } as unknown as ActivatedRouteSnapshot;
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
    const route = { data: { group: 'usuarios' } } as unknown as ActivatedRouteSnapshot;
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
    const route = { data: { group: 'usuarios' } } as unknown as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() => adminGroupGuard(route, {} as never));
    expect(result).toBe(true);
  });
});
