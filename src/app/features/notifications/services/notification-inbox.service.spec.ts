import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../../core/auth/auth.store';
import { API_CONFIG } from '../../../core/config/api.config';
import { AppResumeService } from '../../../core/native/app-resume.service';
import { NotificationInboxService } from './notification-inbox.service';

const socket = vi.hoisted(() => ({
  disconnect: vi.fn(),
  received: undefined as (() => void) | undefined,
  subscribed: undefined as (() => void) | undefined,
}));

vi.mock('pusher-js', () => ({ default: class {} }));
vi.mock('laravel-echo', () => ({
  default: class {
    private() {
      return {
        listen: (event: string, refresh: () => void) => {
          if (event === '.notifications.changed') socket.received = refresh;
          return { subscribed: (callback: () => void) => { socket.subscribed = callback; } };
        },
      };
    }

    disconnect() {
      socket.disconnect();
    }
  },
}));

describe('NotificationInboxService', () => {
  it('refresca al recibir una señal y al reconectar, y limpia el contador al salir', () => {
    const session = signal<{ id: string } | null>({ id: 'session-1' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
        { provide: AppResumeService, useValue: { resumed: EMPTY } },
        {
          provide: AuthStore,
          useValue: {
            session,
            isAuthenticated: () => session() !== null,
            user: () => ({ permissions: ['can_view_notifications'] }),
          },
        },
      ],
    });
    const inbox = TestBed.inject(NotificationInboxService);
    const http = TestBed.inject(HttpTestingController);
    const summary = (count: number) => http.expectOne('/api/v1/notificaciones/resumen').flush({
      data: { no_leidas: count, tiempo_real: { canal: 'notifications.session', clave: 'test' } },
    });

    TestBed.tick();
    summary(0);
    socket.received?.();
    summary(1);
    expect(inbox.unreadCount()).toBe(1);

    socket.subscribed?.();
    summary(2);
    expect(inbox.unreadCount()).toBe(2);

    session.set(null);
    TestBed.tick();
    expect(inbox.unreadCount()).toBe(0);
    expect(socket.disconnect).toHaveBeenCalledOnce();
    http.verify();
  });
});
