import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthApi } from './auth.api';
import { AuthStore } from './auth.store';
import { CredentialStorage } from '../native/credential-storage.service';

describe('AuthStore', () => {
  it('keeps a shared device while clearing an expired employee session', async () => {
    const api = {
      sharedStatus: () => of({
        data: {
          id: 'device-1',
          nombre: 'Tablet',
          expires_at: null,
          revoked_at: null,
        },
      }),
      sharedUsers: () => of({
        data: [{ id: 4, nombre: 'Ana' }],
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
