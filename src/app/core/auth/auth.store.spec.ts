import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { AuthApi } from './auth.api';
import { AuthStore } from './auth.store';
import { CredentialStorage } from '../native/credential-storage.service';
import { AppResumeService } from '../native/app-resume.service';

describe('AuthStore', () => {
  it('replaces a pending people refresh when resuming and ignores its late result', async () => {
    const late = new Subject<unknown>();
    const sharedUsers = vi.fn().mockReturnValueOnce(of({ data: [], meta: { last_page: 1 } })).mockReturnValueOnce(late)
      .mockReturnValueOnce(of({ data: [{ id: 5, name: 'Luis' }], meta: { last_page: 1 } }));
    const api = { sharedStatus: () => of({ data: { id: 'tablet', name: 'Tablet', up_id: 7 } }), sharedUsers };
    const storage = { isNative: () => false, getMode: async () => 'shared' };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }, { provide: CredentialStorage, useValue: storage }] });
    const store = TestBed.inject(AuthStore); await store.bootstrap();
    const refreshing = store.loadSharedUsers(); await store.finishSharedSession();
    expect(store.status()).toBe('shared_selector'); expect(store.sharedUsers()).toEqual([{ id: 5, name: 'Luis' }]);
    late.next({ data: [{ id: 4, name: 'Anterior' }], meta: { last_page: 1 } }); late.complete(); await refreshing;
    expect(store.sharedUsers()).toEqual([{ id: 5, name: 'Luis' }]); expect(store.sharedUsersLoading()).toBe(false);
  });

  it('ignores a delayed PIN login after returning to the selector on resume', async () => {
    const login = new Subject<unknown>();
    const api = { sharedStatus: () => of({ data: { id: 'tablet', name: 'Tablet', up_id: 7 } }), sharedUsers: () => of({ data: [], meta: { last_page: 1 } }), pinLogin: () => login };
    const storage = { isNative: () => false, getMode: async () => 'shared' };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }, { provide: CredentialStorage, useValue: storage }] });
    const store = TestBed.inject(AuthStore); await store.bootstrap();
    const pending = store.loginWithPin(4, '0007'); await store.finishSharedSession();
    login.next({ user: { id: 4, roles: ['employee'] }, session: { id: 'late-session' } }); login.complete();
    expect(await pending).toBe(false); expect(store.user()).toBeNull(); expect(store.status()).toBe('shared_selector');
  });

  it('clears the employee immediately on resume and returns to the selector without unlinking', async () => {
    const resumed = new Subject<void>(); const finalized = new Subject<{ message: string }>();
    const device = { id: 'tablet', name: 'Tablet', up_id: 7, expires_at: null, revoked_at: null };
    const api = {
      sharedStatus: () => of({ data: device }), sharedUsers: () => of({ data: [{ id: 4, name: 'Ana' }], meta: { last_page: 1 } }),
      pinLogin: () => of({ user: { id: 4, name: 'Ana', email: null, rol: { id: 2, clave: 'employee', nombre: 'Empleado' }, permissions: ['can_login_shared'], deleted_at: null }, session: { id: 'employee-session' } }),
      finalize: vi.fn(() => finalized),
    };
    const storage = { isNative: () => false, getMode: async () => 'shared' };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }, { provide: CredentialStorage, useValue: storage }, { provide: AppResumeService, useValue: { resumed } }] });
    const store = TestBed.inject(AuthStore); await store.bootstrap(); await store.loginWithPin(4, '0007');
    expect(store.user()?.name).toBe('Ana'); resumed.next();
    expect(store.user()).toBeNull(); expect(store.session()).toBeNull(); expect(store.device()).toEqual(device);
    expect(api.finalize).toHaveBeenCalledWith('employee-session', true);
    finalized.next({ message: 'ok' }); finalized.complete();
    await vi.waitFor(() => expect(store.status()).toBe('shared_selector'));
    expect(store.isShared()).toBe(true); expect(store.sharedUsers()).toEqual([{ id: 4, name: 'Ana' }]);
  });

  it('recognizes the authoritative single role from the current login contract', async () => {
    const user = { id: 1, name: 'Admin', email: 'admin@example.test', rol: { id: 1, clave: 'admin', nombre: 'Administrador' }, permissions: ['can_manage_shared_devices'], deleted_at: null };
    const api = { csrf: async () => undefined, webLogin: () => of({ user, session: null }) };
    const storage = { isNative: () => false, setMode: async () => undefined };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }, { provide: CredentialStorage, useValue: storage }] });
    const store = TestBed.inject(AuthStore);
    expect(await store.login(user.email, 'example-only')).toBe(true);
    expect(store.isAdmin()).toBe(true); expect(store.user()?.roles).toEqual(['admin']);
    expect(store.user()?.permissions).toEqual(['can_manage_shared_devices']);
  });

  it('loads every page of eligible people and recovers a failed selector without losing the device', async () => {
    const device = { id: 'tablet', name: 'Tablet', up_id: 7, expires_at: null, revoked_at: null };
    const sharedUsers = vi.fn().mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(of({ data: [{ id: 4, name: 'Ana' }], meta: { last_page: 2 } }))
      .mockReturnValueOnce(of({ data: [{ id: 5, name: 'Luis' }], meta: { last_page: 2 } }));
    const api = { sharedStatus: () => of({ data: device }), sharedUsers };
    const storage = { isNative: () => false, getMode: async () => 'shared', getDeviceToken: async () => null };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }, { provide: CredentialStorage, useValue: storage }] });
    const store = TestBed.inject(AuthStore); await store.bootstrap();
    expect(store.status()).toBe('shared_selector'); expect(store.device()).toEqual(device); expect(store.errorMessage()).toContain('conectar');
    await store.loadSharedUsers();
    expect(store.sharedUsers().map((person) => person.name)).toEqual(['Ana', 'Luis']);
    expect(sharedUsers).toHaveBeenLastCalledWith(true, 2); expect(store.errorMessage()).toBeNull();
  });

  it('refreshes permissions without overwriting an identity that changed during the request', async () => {
    const user = { id: 1, name: 'Auditor', email: 'auditor@example.test', roles: [], permissions: ['audit.view'], deleted_at: null };
    const pending = new Subject<{ data: typeof user; session: null }>();
    const api = { csrf: async () => undefined, webLogin: () => of({ user, session: null }), me: vi.fn().mockReturnValue(pending) };
    const storage = { isNative: () => false, setMode: async () => undefined, removePersonalToken: async () => undefined };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }, { provide: CredentialStorage, useValue: storage }] });
    const store = TestBed.inject(AuthStore);
    await store.login(user.email, 'example-only');
    const refreshing = store.refreshIdentity();
    pending.next({ data: { ...user, permissions: [] }, session: null }); pending.complete(); await refreshing;
    expect(store.user()?.permissions).toEqual([]);
    const late = new Subject<{ data: typeof user; session: null }>(); api.me.mockReturnValue(late);
    const stale = store.refreshIdentity();
    store.handleHttpError(new HttpErrorResponse({ status: 401, error: { code: 'SESSION_EXPIRED' } }), 'me');
    late.next({ data: user, session: null }); late.complete(); await stale;
    expect(store.user()).toBeNull();
  });

  it('keeps the current identity on a wrong confirmation password, but clears a real unauthorized session', async () => {
    const user = { id: 1, name: 'Admin', email: 'admin@example.test', roles: ['admin'], permissions: [], deleted_at: null };
    const api = { csrf: async () => undefined, webLogin: () => of({ user, session: null }) };
    const storage = { isNative: () => false, setMode: async () => undefined, removePersonalToken: async () => undefined };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }, { provide: CredentialStorage, useValue: storage }] });
    const store = TestBed.inject(AuthStore);
    await store.login('admin@example.test', 'example-only');
    const invalid = new HttpErrorResponse({ status: 401, error: { code: 'INVALID_CREDENTIALS' } });
    store.handleHttpError(invalid, 'https://api.example.test/api/v1/auth/web/confirm-password');
    store.handleHttpError(invalid, '/api/v1/auth/confirm-password?test=1');
    expect(store.user()).toEqual(user); expect(store.isAuthenticated()).toBe(true);
    store.handleHttpError(new HttpErrorResponse({ status: 401, error: { code: 'SESSION_EXPIRED' } }), '/api/v1/auth/web/confirm-password');
    expect(store.user()).toBeNull(); expect(store.isAuthenticated()).toBe(false);
  });

  it('does not exempt other unauthorized requests with the same error code', async () => {
    const api = { csrf: async () => undefined, webLogin: () => of({ user: { id: 1, roles: ['admin'] }, session: null }) };
    const storage = { isNative: () => false, setMode: async () => undefined, removePersonalToken: async () => undefined };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }, { provide: CredentialStorage, useValue: storage }] });
    const store = TestBed.inject(AuthStore);
    await store.login('admin@example.test', 'example-only');
    store.handleHttpError(new HttpErrorResponse({ status: 401, error: { code: 'INVALID_CREDENTIALS' } }), '/api/v1/users');
    expect(store.user()).toBeNull(); expect(store.isAuthenticated()).toBe(false);
  });

  it('gets a CSRF cookie before web device pairing', async () => {
    const calls: string[] = [];
    const api = {
      csrf: async () => { calls.push('csrf'); },
      pair: () => {
        calls.push('pair');
        return of({ device: { id: 'device-1', name: 'Tablet', expires_at: null } });
      },
      sharedStatus: () => of({ data: { id: 'device-1', name: 'Tablet', expires_at: null, revoked_at: null } }),
      sharedUsers: () => of({ data: [], meta: { current_page: 1, last_page: 1, per_page: 50, total: 0 } }),
    };
    const storage = {
      isNative: () => false,
      removePersonalToken: async () => undefined,
      setMode: async () => undefined,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthApi, useValue: api },
        { provide: CredentialStorage, useValue: storage },
      ],
    });

    const store = TestBed.inject(AuthStore);
    expect(await store.pair('ABCD1234', 'Tablet')).toBe(true);
    expect(calls).toEqual(['csrf', 'pair']);
  });

  it('keeps a shared device while clearing an expired employee session', async () => {
    const api = {
      sharedStatus: () => of({
        data: {
          id: 'device-1',
          name: 'Tablet',
          expires_at: null,
          revoked_at: null,
        },
      }),
      sharedUsers: () => of({
        data: [{ id: 4, name: 'Ana' }],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 1 },
      }),
      pinLogin: () => throwError(() => new HttpErrorResponse({
        status: 401,
        error: { code: 'SESSION_EXPIRED', message: 'expired' },
      })),
    };
    const storage = {
      isNative: () => false,
      getMode: async () => 'shared' as const,
      getDeviceToken: async () => null,
      getPersonalToken: async () => null,
      removePersonalToken: async () => undefined,
      setMode: async () => undefined,
      clearShared: async () => undefined,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthApi, useValue: api },
        { provide: CredentialStorage, useValue: storage },
      ],
    });

    const store = TestBed.inject(AuthStore);
    await store.bootstrap();

    expect(store.status()).toBe('shared_selector');
    expect(store.device()?.id).toBe('device-1');
    await store.loginWithPin(4, '0007');
    expect(store.status()).toBe('shared_selector');
    expect(store.device()?.id).toBe('device-1');
  });
});
