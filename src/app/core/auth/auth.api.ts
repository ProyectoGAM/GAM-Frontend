import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../api/api-client';
import {
  MeResponse,
  PersonalLoginResponse,
  SharedDeviceStatusResponse,
  SharedPairingResponse,
  SharedUsersResponse,
} from './auth.types';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(ApiClient);
  private readonly http = inject(HttpClient);

  async csrf(): Promise<void> {
    await firstValueFrom(
      this.http.get('/sanctum/csrf-cookie', { withCredentials: true }),
    );
  }

  personalLogin(email: string, password: string) {
    return this.api.post<PersonalLoginResponse>(
      'auth/login',
      { email, password },
    );
  }

  webLogin(email: string, password: string) {
    return this.api.post<PersonalLoginResponse>(
      'auth/web/login',
      { email, password },
      { withCredentials: true },
    );
  }

  me() {
    return this.api.get<MeResponse>('me', { withCredentials: true });
  }

  personalLogout() {
    return this.api.post<{ message: string }>(
      'auth/logout',
      {},
      { withCredentials: true },
    );
  }

  webLogout() {
    return this.api.post<{ message: string }>(
      'auth/web/logout',
      {},
      { withCredentials: true },
    );
  }

  confirmPassword(password: string, web: boolean) {
    return this.api.post<{ message: string }>(
      web ? 'auth/web/confirm-password' : 'auth/confirm-password',
      { password },
      { withCredentials: true },
    );
  }

  pair(code: string, deviceName: string, web: boolean) {
    const path = web ? 'auth/web/pairing' : 'shared-devices/pairing';

    return this.api.post<SharedPairingResponse>(
      path,
      { code, device_name: deviceName },
      { withCredentials: web },
    );
  }

  sharedStatus(web: boolean) {
    const path = web
      ? 'shared-device/web'
      : 'shared-device';

    return this.api.get<SharedDeviceStatusResponse>(path, {
      withCredentials: web,
    });
  }

  sharedUsers(web: boolean) {
    const path = web
      ? 'shared-device/web/users'
      : 'shared-device/users';

    return this.api.get<SharedUsersResponse>(path, {
      withCredentials: web,
    });
  }

  pinLogin(userId: number, pin: string, web: boolean) {
    const path = web
      ? 'shared-device/web/login-pin'
      : 'shared-device/login-pin';

    return this.api.post<PersonalLoginResponse>(
      path,
      { user_id: userId, pin },
      { withCredentials: web },
    );
  }

  activity(web: boolean) {
    const path = web
      ? 'shared-device/web/activity'
      : 'shared-device/activity';

    return this.api.post<{ expires_at: string | null }>(
      path,
      {},
      { withCredentials: web },
    );
  }

  finalize(sessionId: string, web: boolean) {
    const path = web
      ? 'shared-device/web/finalize'
      : 'shared-device/finalize';

    return this.api.post<{ message: string }>(
      path,
      { session_id: sessionId },
      { withCredentials: web },
    );
  }

}
