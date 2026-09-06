import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { AuthUser, SharedDevice } from '../../core/auth/auth.types';

interface UserListResponse {
  data: AuthUser[];
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
    return this.api.get<UserListResponse>('usuarios');
  }

  createUser(data: {
    nombre: string;
    correo_electronico: string;
    password: string;
    password_confirmation: string;
    rol: string;
  }) {
    return this.api.post<{ data: AuthUser }>('usuarios', data);
  }

  changeStatus(id: number, enabled: boolean) {
    return this.api.patch<{ data: AuthUser }, { habilitado: boolean }>(
      'usuarios/' + id + '/estado',
      { habilitado: enabled },
    );
  }

  setPin(id: number, pin: string) {
    return this.api.put<{ data: AuthUser }, { pin: string; pin_confirmation: string }>(
      'usuarios/' + id + '/pin',
      { pin, pin_confirmation: pin },
    );
  }

  deletePin(id: number) {
    return this.api.delete<{ message: string }>('usuarios/' + id + '/pin');
  }

  unlockPin(id: number) {
    return this.api.post<{ message: string }>('usuarios/' + id + '/pin/desbloqueo', {});
  }

  resetPassword(id: number, password: string) {
    return this.api.put<{ message: string }, { password: string; password_confirmation: string }>(
      'usuarios/' + id + '/password',
      { password, password_confirmation: password },
    );
  }

  revokeSessions(id: number) {
    return this.api.delete<{ message: string }>('usuarios/' + id + '/sesiones');
  }

  devices() {
    return this.api.get<DeviceListResponse>('dispositivos-compartidos');
  }

  generateCode(name: string) {
    return this.api.post<CreatedCodeResponse, { nombre: string }>(
      'dispositivos-compartidos/codigos',
      { nombre: name },
    );
  }

  revokeDevice(id: string) {
    return this.api.delete<{ message: string }>(
      'dispositivos-compartidos/' + id + '/vinculacion',
    );
  }
}
