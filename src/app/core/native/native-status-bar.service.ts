import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

@Injectable({ providedIn: 'root' })
export class NativeStatusBarService {
  private readonly document = inject(DOCUMENT);

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const { height } = await StatusBar.getInfo();
      if (height > 0) {
        this.document.documentElement.style.setProperty('--gam-status-bar-inset', `${height}px`);
      }
    } catch {
      // CSS safe-area insets remain the fallback if the native plugin is unavailable.
    }
  }
}
