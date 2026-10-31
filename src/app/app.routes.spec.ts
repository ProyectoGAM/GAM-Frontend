import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';
import { authGuard } from './core/guards/auth.guard';
import { adminPanelGuard } from './core/guards/admin-panel.guard';
import { AccessDeniedPage } from './features/admin/access-denied.page';

@Component({ selector: 'app-panel-stub', template: 'Panel administrativo' })
class PanelStubComponent {}
@Component({ selector: 'app-login-stub', template: 'Ingresar' })
class LoginStubComponent {}

describe('Legacy Home redirect', () => {
  it.each([
    { roles: ['admin'], authenticated: true, destination: '/administracion' },
    { roles: ['employee'], authenticated: true, destination: '/administracion' },
    { roles: [], authenticated: false, destination: '/auth' },
  ])('redirects /home through panel authorization ($destination)', async ({ roles, authenticated, destination }) => {
    const logout = vi.fn(async () => undefined);
    TestBed.configureTestingModule({ providers: [
      provideRouter([
        routes.find((route) => route.path === 'home')!,
        { path: 'administracion', component: PanelStubComponent, canActivate: [authGuard, adminPanelGuard] },
        { path: 'auth', component: LoginStubComponent },
        { path: 'acceso-denegado', component: AccessDeniedPage },
      ]),
      { provide: AuthStore, useValue: { user: () => ({ roles }), isAuthenticated: () => authenticated, whenReady: async () => undefined, logout } },
    ] });
    const harness = await RouterTestingHarness.create('/home');
    expect(TestBed.inject(Router).url).toBe(destination);
    if (destination === '/acceso-denegado') {
      expect(harness.routeNativeElement?.querySelector('a[href="/administracion"]')).toBeNull();
      harness.routeNativeElement?.querySelector<HTMLIonButtonElement>('ion-button')?.click();
      await harness.fixture.whenStable();
      expect(logout).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(Router).url).toBe('/auth');
    }
  });
});
