import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { adminPanelGuard } from './admin-panel.guard';

describe('adminPanelGuard', () => {
  it('sends a guest to sign in', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { whenReady: async () => undefined, isAuthenticated: () => false, user: () => null } }],
    });
    const result = await TestBed.runInInjectionContext(() => adminPanelGuard({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['parseUrl']>)).toBe('/auth');
  });

  it('denies an authenticated user whose roles have no group grants', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { whenReady: async () => undefined, isAuthenticated: () => true, user: () => ({ roles: ['employee'] }) } }],
    });
    const result = await TestBed.runInInjectionContext(() => adminPanelGuard({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['parseUrl']>)).toBe('/acceso-denegado');
  });

  it('keeps ADMIN access to the panel', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { whenReady: async () => undefined, isAuthenticated: () => true, user: () => ({ roles: ['admin'] }) } }],
    });
    const result = await TestBed.runInInjectionContext(() => adminPanelGuard({} as never, {} as never));
    expect(result).toBe(true);
  });
});
