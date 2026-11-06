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
  function setup() {
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
    const refresh = (unread: number) => {
      http.expectOne('/api/v1/notificaciones/resumen').flush({
        data: { no_leidas: unread + 3, tiempo_real: { canal: 'notifications.session', clave: 'test' } },
      });
      http.expectOne('/api/v1/notificaciones?page=1&per_page=1&orden=fecha&estado_lectura=no_leida&estado_resolucion=vigente').flush({
        data: [],
        meta: { current_page: 1, last_page: Math.max(1, unread), total: unread },
      });
    };
    return { session, inbox, http, refresh };
  }

  it('refresca al recibir una señal y al reconectar, y limpia el contador al salir', () => {
    const { session, inbox, http, refresh } = setup();
    TestBed.tick();
    refresh(0);
    socket.received?.();
    refresh(1);
    expect(inbox.unreadCount()).toBe(1);

    socket.subscribed?.();
    refresh(2);
    expect(inbox.unreadCount()).toBe(2);

    session.set(null);
    TestBed.tick();
    expect(inbox.unreadCount()).toBe(0);
    expect(socket.disconnect).toHaveBeenCalledOnce();
    http.verify();
  });

  it('delega el filtro de resolución y la paginación en el servidor', () => {
    const { inbox, http } = setup();
    const receive = vi.fn();
    inbox.list({ view: 'all', order: 'fecha', perPage: 5 }).subscribe(receive);
    inbox.list({ view: 'resolved', order: 'urgencia', urgency: 'alto', page: 2 }).subscribe(receive);

    const recent = { data: [], meta: { current_page: 1, last_page: 1, total: 0 } };
    const resolved = { data: [], meta: { current_page: 2, last_page: 3, total: 45 } };
    http.expectOne('/api/v1/notificaciones?page=1&per_page=5&orden=fecha&estado_resolucion=vigente').flush(recent);
    http.expectOne('/api/v1/notificaciones?page=2&per_page=20&orden=urgencia&urgencia=alto&estado_resolucion=resuelto').flush(resolved);
    expect(receive.mock.calls).toEqual([[recent], [resolved]]);
    http.verify();
  });
});
