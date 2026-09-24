import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { AuthUser, SharedDevice } from '../../core/auth/auth.types';

interface UserListResponse {
  data: AuthUser[] | { data: AuthUser[] };
}

interface DeviceListResponse {
  data: SharedDevice[];
}

interface CreatedCodeResponse {
  code: string;
  expires_at: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(ApiClient);

  users() {
    return this.api.get<UserListResponse>('users');
  }

  createUser(data: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    role: string;
  }) {
    return this.api.post<{ data: AuthUser }>('users', data);
  }

  changeStatus(id: number, enabled: boolean) {
    return this.api.patch<{ data: AuthUser }, { enabled: boolean }>(
      'users/' + id + '/status',
      { enabled },
    );
  }

  setPin(id: number, pin: string) {
    return this.api.put<{ data: AuthUser }, { pin: string; pin_confirmation: string }>(
      'users/' + id + '/pin',
      { pin, pin_confirmation: pin },
    );
  }

  deletePin(id: number) {
    return this.api.delete<{ message: string }>('users/' + id + '/pin');
  }

  unlockPin(id: number) {
    return this.api.post<{ message: string }>('users/' + id + '/pin/unlock', {});
  }

  resetPassword(id: number, password: string) {
    return this.api.put<{ message: string }, { password: string; password_confirmation: string }>(
      'users/' + id + '/password',
      { password, password_confirmation: password },
    );
  }

  revokeSessions(id: number) {
    return this.api.delete<{ message: string }>('users/' + id + '/sessions');
  }

  devices() {
    return this.api.get<DeviceListResponse>('shared-devices');
  }

  generateCode(name: string) {
    return this.api.post<CreatedCodeResponse, { name: string }>(
      'shared-devices/codes',
      { name },
    );
  }

  revokeDevice(id: string) {
    return this.api.delete<{ message: string }>(
      'shared-devices/' + id + '/pairing',
    );
  }
}
