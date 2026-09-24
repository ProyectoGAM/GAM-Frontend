import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CredentialStorage } from '../native/credential-storage.service';
import { AuthApi } from './auth.api';
import { isAdminUser } from './access-policy';
import {
  ApiProblem,
  AuthSession,
  AuthStatus,
  AuthUser,
  DeviceMode,
  SharedDevice,
  SharedUser,
} from './auth.types';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly storage = inject(CredentialStorage);
  private bootstrapPromise: Promise<void> | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = 0;
  private readonly activityHandler = (): void => this.noteUserActivity();

  private readonly statusState = signal<AuthStatus>('initializing');
  private readonly modeState = signal<DeviceMode>('personal');
  private readonly userState = signal<AuthUser | null>(null);
  private readonly sessionState = signal<AuthSession | null>(null);
  private readonly deviceState = signal<SharedDevice | null>(null);
  private readonly sharedUsersState = signal<SharedUser[]>([]);
  private readonly errorState = signal<string | null>(null);
  private personalToken: string | null = null;
  private deviceToken: string | null = null;

  readonly status = this.statusState.asReadonly();
  readonly mode = this.modeState.asReadonly();
  readonly user = this.userState.asReadonly();
  readonly session = this.sessionState.asReadonly();
  readonly device = this.deviceState.asReadonly();
  readonly sharedUsers = this.sharedUsersState.asReadonly();
  readonly errorMessage = this.errorState.asReadonly();
  readonly isAuthenticated = computed(() =>
    this.statusState() === 'personal_authenticated'
    || this.statusState() === 'shared_authenticated',
  );
  readonly isShared = computed(() => this.modeState() === 'shared');
  readonly isAdmin = computed(() => isAdminUser(this.userState()));

  isAdminUser(user: AuthUser | null): boolean {
    return isAdminUser(user);
  }

  bootstrap(): Promise<void> {
    this.bootstrapPromise ??= this.restore();

    return this.bootstrapPromise;
  }

  async whenReady(): Promise<void> {
    await this.bootstrap();
  }

  async login(email: string, password: string): Promise<boolean> {
    this.errorState.set(null);
    this.stopActivity();

    try {
      if (this.storage.isNative()) {
        const response = await firstValueFrom(this.api.personalLogin(email, password));
        if (response.access_token) {
          await this.storage.setPersonalToken(response.access_token);
          this.personalToken = response.access_token;
        }
        this.setPersonal(response.user, response.session);
      } else {
        await this.api.csrf();
        const response = await firstValueFrom(this.api.webLogin(email, password));
        this.setPersonal(response.user, response.session);
      }

      await this.storage.setMode('personal');
      this.modeState.set('personal');
      return true;
    } catch (error) {
      this.errorState.set(this.messageFor(error, 'No se pudo iniciar sesión.'));
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.storage.isNative()) {
        if (this.personalToken || this.statusState() === 'shared_authenticated') {
          await firstValueFrom(this.api.personalLogout());
        }
      } else {
        await this.api.csrf();
        await firstValueFrom(this.api.webLogout());
      }
    } catch {
      // La limpieza local es obligatoria aunque el servidor no esté disponible.
    } finally {
      await this.clearPersonal();
      await this.clearShared(false);
      this.modeState.set('personal');
      await this.storage.setMode('personal');
      this.statusState.set('personal_guest');
    }
  }

  async confirmPassword(password: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.confirmPassword(password, !this.storage.isNative()));
      return true;
    } catch (error) {
      this.errorState.set(this.messageFor(error, 'No se pudo confirmar la contraseña.'));
      return false;
    }
  }

  async pair(code: string, deviceName: string): Promise<boolean> {
    this.errorState.set(null);

    try {
      if (!this.storage.isNative()) {
        await this.api.csrf();
      }
      const response = await firstValueFrom(
        this.api.pair(code, deviceName, !this.storage.isNative()),
      );

      if (this.storage.isNative()) {
        if (!response.device_token) {
          throw new Error('El servidor no entregó la credencial del dispositivo.');
        }

        await this.storage.setDeviceToken(response.device_token);
        this.deviceToken = response.device_token;
      }

      await this.clearPersonal();
      await this.storage.setMode('shared');
      this.modeState.set('shared');
      await this.verifySharedDevice();
      return this.statusState() === 'shared_selector';
    } catch (error) {
      this.errorState.set(this.messageFor(error, 'No se pudo vincular el dispositivo.'));
      return false;
    }
  }

  async loadSharedUsers(): Promise<SharedUser[]> {
    try {
      const response = await firstValueFrom(
        this.api.sharedUsers(!this.storage.isNative()),
      );
      this.sharedUsersState.set(response.data);
      this.statusState.set('shared_selector');
      return response.data;
    } catch (error) {
      this.errorState.set(this.messageFor(error, 'No se pudo cargar la lista de empleados.'));
      return [];
    }
  }

  async loginWithPin(userId: number, pin: string): Promise<boolean> {
    this.errorState.set(null);

    try {
      const response = await firstValueFrom(
        this.api.pinLogin(userId, pin, !this.storage.isNative()),
      );

      if (this.storage.isNative() && response.access_token) {
        this.personalToken = response.access_token;
      }

      this.userState.set(response.user);
      this.sessionState.set(response.session);
      this.statusState.set('shared_authenticated');
      this.lastActivityAt = Date.now();
      this.startActivity();
      return true;
    } catch (error) {
      this.errorState.set(this.messageFor(error, 'El PIN no es válido.'));
      return false;
    }
  }

  async finishSharedSession(): Promise<void> {
    const session = this.sessionState();

    try {
      if (session) {
        await firstValueFrom(
          this.api.finalize(session.id, !this.storage.isNative()),
        );
      }
    } catch {
      // Se limpia la identidad aunque la red no responda.
    } finally {
      this.stopActivity();
      this.personalToken = null;
      this.userState.set(null);
      this.sessionState.set(null);
      this.errorState.set(null);
      await this.verifySharedDevice();
    }
  }

  noteUserActivity(): void {
    if (this.statusState() !== 'shared_authenticated') {
      return;
    }

    this.lastActivityAt = Date.now();
  }

  handleHttpError(error: HttpErrorResponse, requestUrl: string): void {
    if (error.status !== 401) {
      return;
    }

    const problem = this.problem(error);
    if (problem.code === 'SHARED_DEVICE_UNAUTHORIZED') {
      void this.clearShared(true);
      return;
    }

    if (this.statusState() === 'shared_authenticated'
      || problem.code === 'SESSION_EXPIRED'
      || problem.code === 'SESSION_CHANGED') {
      this.stopActivity();
      this.personalToken = null;
      this.userState.set(null);
      this.sessionState.set(null);
      this.statusState.set(this.deviceState() ? 'shared_selector' : 'personal_guest');
      return;
    }

    if (!requestUrl.includes('/auth/login') && !requestUrl.includes('/auth/web/login')) {
      void this.clearPersonal();
      this.statusState.set('personal_guest');
    }
  }

  bearerToken(): string | null {
    return this.personalToken;
  }

  sharedDeviceToken(): string | null {
    return this.deviceToken;
  }

  sharedSessionId(): string | null {
    return this.statusState() === 'shared_authenticated'
      ? this.sessionState()?.id ?? null
      : null;
  }

  storageIsNative(): boolean {
    return this.storage.isNative();
  }

  private async restore(): Promise<void> {
    try {
      const mode = await this.storage.getMode();
      this.modeState.set(mode);

      if (mode === 'shared') {
        await this.verifySharedDevice();
        return;
      }

      this.personalToken = await this.storage.getPersonalToken();
      if (!this.storage.isNative() || this.personalToken) {
        const response = await firstValueFrom(this.api.me());
        this.setPersonal(response.data, response.session);
        return;
      }

      this.statusState.set('personal_guest');
    } catch (error) {
      if (this.isUnauthorized(error)) {
        await this.clearPersonal();
        this.statusState.set('personal_guest');
        return;
      }

      this.errorState.set(this.messageFor(error, 'No se pudo verificar la sesión.'));
      this.statusState.set('connection_error');
    }
  }

  private async verifySharedDevice(): Promise<void> {
    this.statusState.set('shared_verifying');

    try {
      if (this.storage.isNative()) {
        this.deviceToken = await this.storage.getDeviceToken();
        if (!this.deviceToken) {
          await this.clearShared(false);
          this.statusState.set('personal_guest');
          this.errorState.set('Vincula este dispositivo para usar el modo compartido.');
          return;
        }
      }

      const response = await firstValueFrom(
        this.api.sharedStatus(!this.storage.isNative()),
      );
      this.deviceState.set(response.data);
      this.userState.set(null);
      this.sessionState.set(null);
      this.personalToken = null;
      await this.loadSharedUsers();
    } catch (error) {
      if (this.isUnauthorized(error)) {
        await this.clearShared(true);
        this.statusState.set('personal_guest');
        this.errorState.set('La vinculación ya no es válida. Puedes vincularla nuevamente.');
        return;
      }

      this.errorState.set(this.messageFor(error, 'No se pudo verificar el dispositivo.'));
      this.statusState.set('connection_error');
    }
  }

  private setPersonal(user: AuthUser, session: AuthSession | null): void {
    this.modeState.set('personal');
    this.userState.set(user);
    this.sessionState.set(session);
    this.deviceState.set(null);
    this.statusState.set('personal_authenticated');
    this.errorState.set(null);
  }

  private async clearPersonal(): Promise<void> {
    this.stopActivity();
    this.personalToken = null;
    this.userState.set(null);
    this.sessionState.set(null);
    await this.storage.removePersonalToken();
  }

  private async clearShared(resetMode: boolean): Promise<void> {
    this.stopActivity();
    this.deviceToken = null;
    this.deviceState.set(null);
    this.sharedUsersState.set([]);
    this.userState.set(null);
    this.sessionState.set(null);

    if (resetMode) {
      await this.storage.clearShared();
      this.modeState.set('personal');
    }
  }

  private startActivity(): void {
    this.stopActivity();
    document.addEventListener('pointerdown', this.activityHandler, { passive: true });
    document.addEventListener('keydown', this.activityHandler, { passive: true });
    this.activityTimer = setInterval(() => {
      if (document.visibilityState === 'visible'
        && Date.now() - this.lastActivityAt <= 30_000) {
        void firstValueFrom(this.api.activity(!this.storage.isNative())).catch(() => undefined);
      }
    }, 30_000);
  }

  private stopActivity(): void {
    document.removeEventListener('pointerdown', this.activityHandler);
    document.removeEventListener('keydown', this.activityHandler);
    if (this.activityTimer !== null) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private isUnauthorized(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 401;
  }

  private problem(error: HttpErrorResponse): ApiProblem {
    return typeof error.error === 'object' && error.error !== null
      ? error.error as ApiProblem
      : {};
  }

  private messageFor(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const problem = this.problem(error);
      if (error.status === 429) {
        return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
      }
      if (error.status === 0) {
        return 'No hay conexión con el servidor.';
      }
      return problem.message ?? problem.detail ?? fallback;
    }

    return error instanceof Error ? error.message : fallback;
  }
}
