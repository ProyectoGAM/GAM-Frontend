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
      'autenticacion/inicio-sesion',
      { correo_electronico: email, password },
    );
  }

  webLogin(email: string, password: string) {
    return this.api.post<PersonalLoginResponse>(
      'autenticacion/web/inicio-sesion',
      { correo_electronico: email, password },
      { withCredentials: true },
    );
  }

  me() {
    return this.api.get<MeResponse>('mi-perfil', { withCredentials: true });
  }

  personalLogout() {
    return this.api.post<{ message: string }>(
      'autenticacion/cerrar-sesion',
      {},
      { withCredentials: true },
    );
  }

  webLogout() {
    return this.api.post<{ message: string }>(
      'autenticacion/web/cerrar-sesion',
      {},
      { withCredentials: true },
    );
  }

  confirmPassword(password: string) {
    return this.api.post<{ message: string }>(
      'autenticacion/confirmar-password',
      { password },
      { withCredentials: true },
    );
  }

  pair(code: string, deviceName: string, web: boolean) {
    const path = web
      ? 'autenticacion/web/vinculacion'
      : 'dispositivos-compartidos/vinculacion';

    return this.api.post<SharedPairingResponse>(
      path,
      { codigo: code, device_name: deviceName },
      { withCredentials: web },
    );
  }

  sharedStatus(web: boolean) {
    const path = web
      ? 'dispositivo-compartido/web'
      : 'dispositivo-compartido';

    return this.api.get<SharedDeviceStatusResponse>(path, {
      withCredentials: web,
    });
  }

  sharedUsers(web: boolean) {
    const path = web
      ? 'dispositivo-compartido/web/usuarios'
      : 'dispositivo-compartido/usuarios';

    return this.api.get<SharedUsersResponse>(path, {
      withCredentials: web,
    });
  }

  pinLogin(userId: number, pin: string, web: boolean) {
    const path = web
      ? 'dispositivo-compartido/web/inicio-sesion-pin'
      : 'dispositivo-compartido/inicio-sesion-pin';

    return this.api.post<PersonalLoginResponse>(
      path,
      { usuario_id: userId, pin },
      { withCredentials: web },
    );
  }

  activity(web: boolean) {
    const path = web
      ? 'dispositivo-compartido/web/actividad'
      : 'dispositivo-compartido/actividad';

    return this.api.post<{ expires_at: string | null }>(
      path,
      {},
      { withCredentials: web },
    );
  }

  finalize(sessionId: string, web: boolean) {
    const path = web
      ? 'dispositivo-compartido/web/finalizar-sesion'
      : 'dispositivo-compartido/finalizar-sesion';

    return this.api.post<{ message: string }>(
      path,
      { sesion_id: sessionId },
      { withCredentials: web },
    );
  }

}
