import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AppResumeService {
  private readonly document = inject(DOCUMENT);

  readonly resumed = new Observable<void>((subscriber) => {
    let hidden = this.document.visibilityState === 'hidden';
    const visibilityChanged = () => {
      if (this.document.visibilityState === 'hidden') hidden = true;
      else if (hidden) { hidden = false; subscriber.next(); }
    };
    if (Capacitor.isNativePlatform()) {
      let disposed = false;
      let listener: PluginListenerHandle | undefined;
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) subscriber.next();
      }).then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      }).catch(() => {
        if (!disposed) this.document.addEventListener('visibilitychange', visibilityChanged);
      });
      return () => { disposed = true; void listener?.remove(); this.document.removeEventListener('visibilitychange', visibilityChanged); };
    }

    this.document.addEventListener('visibilitychange', visibilityChanged);
    return () => this.document.removeEventListener('visibilitychange', visibilityChanged);
  });
}
