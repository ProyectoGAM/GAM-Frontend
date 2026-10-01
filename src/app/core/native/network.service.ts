import { Network } from '@capacitor/network';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly native = Capacitor.isNativePlatform();
  private readonly onlineState = signal(globalThis.navigator?.onLine ?? true);
  readonly online = this.onlineState.asReadonly();
  private nativeListener: PluginListenerHandle | null = null;

  constructor() {
    if (this.native) {
      void Network.addListener('networkStatusChange', (status) => this.onlineState.set(status.connected))
        .then((listener) => this.nativeListener = listener);
    } else {
      globalThis.addEventListener?.('online', this.setOnline);
      globalThis.addEventListener?.('offline', this.setOffline);
    }

    this.destroyRef.onDestroy(() => {
      globalThis.removeEventListener?.('online', this.setOnline);
      globalThis.removeEventListener?.('offline', this.setOffline);
      void this.nativeListener?.remove();
    });
  }

  private readonly setOnline = (): void => this.onlineState.set(true);
  private readonly setOffline = (): void => this.onlineState.set(false);
}
