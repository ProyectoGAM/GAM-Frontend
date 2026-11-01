import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from './api-client';

export type ServerHealthState = 'checking' | 'online' | 'offline';

@Injectable({ providedIn: 'root' })
export class ServerHealthService {
  private readonly api = inject(ApiClient);
  private timer: ReturnType<typeof setInterval> | null = null;
  private requestInFlight = false;
  readonly state = signal<ServerHealthState>('checking');

  start(): void {
    if (this.timer) return;
    this.state.set('checking');
    void this.check();
    this.timer = setInterval(() => void this.check(), 10_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async check(): Promise<void> {
    if (this.requestInFlight) return;
    this.requestInFlight = true;
    try {
      const response = await firstValueFrom(this.api.get<{ status: 'ok' }>('health'));
      this.state.set(response.status === 'ok' ? 'online' : 'offline');
    } catch {
      this.state.set('offline');
    } finally {
      this.requestInFlight = false;
    }
  }
}
