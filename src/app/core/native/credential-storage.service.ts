import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Injectable } from '@angular/core';

import { DeviceMode } from '../auth/auth.types';

const MODE_KEY = 'gam.deviceMode.v1';
const PERSONAL_TOKEN_KEY = 'gam.personalToken.v1';
const DEVICE_TOKEN_KEY = 'gam.sharedDeviceToken.v1';

@Injectable({ providedIn: 'root' })
export class CredentialStorage {
  private readonly native = Capacitor.isNativePlatform();

  async getMode(): Promise<DeviceMode> {
    const value = this.native
      ? (await Preferences.get({ key: MODE_KEY })).value
      : this.readWeb(MODE_KEY);

    return value === 'shared' ? 'shared' : 'personal';
  }

  async setMode(mode: DeviceMode): Promise<void> {
    if (this.native) {
      await Preferences.set({ key: MODE_KEY, value: mode });
      return;
    }

    this.writeWeb(MODE_KEY, mode);
  }

  async getPersonalToken(): Promise<string | null> {
    return this.native ? this.getSecure(PERSONAL_TOKEN_KEY) : null;
  }

  async setPersonalToken(token: string): Promise<void> {
    await this.setSecure(PERSONAL_TOKEN_KEY, token);
  }

  async removePersonalToken(): Promise<void> {
    await this.removeSecure(PERSONAL_TOKEN_KEY);
  }

  async getDeviceToken(): Promise<string | null> {
    return this.native ? this.getSecure(DEVICE_TOKEN_KEY) : null;
  }

  async setDeviceToken(token: string): Promise<void> {
    await this.setSecure(DEVICE_TOKEN_KEY, token);
  }

  async removeDeviceToken(): Promise<void> {
    await this.removeSecure(DEVICE_TOKEN_KEY);
  }

  async clearShared(): Promise<void> {
    await this.removeDeviceToken();
    await this.setMode('personal');
  }

  isNative(): boolean {
    return this.native;
  }

  private async getSecure(key: string): Promise<string | null> {
    if (!this.native) {
      return null;
    }

    return SecureStorage.getItem(key);
  }

  private async setSecure(key: string, value: string): Promise<void> {
    if (!this.native) {
      throw new Error('El almacenamiento seguro solo está disponible en nativo.');
    }

    // Evita que Keychain sincronice la credencial con iCloud.
    await SecureStorage.setSynchronize(false);
    await SecureStorage.setItem(key, value);
  }

  private async removeSecure(key: string): Promise<void> {
    if (this.native) {
      await SecureStorage.removeItem(key);
    }
  }

  private readWeb(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeWeb(key: string, value: string): void {
    try {
      globalThis.localStorage.setItem(key, value);
    } catch {
      throw new Error('No se pudo guardar la preferencia local.');
    }
  }
}
