import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthApi } from './auth.api';
import { AuthStore } from './auth.store';
import { CredentialStorage } from '../native/credential-storage.service';

describe('AuthStore', () => {
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
