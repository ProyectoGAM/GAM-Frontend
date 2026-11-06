import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { catchError, filter, forkJoin, fromEvent, map, merge, of, startWith, Subject, switchMap } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth.store';
import { API_CONFIG } from '../../../core/config/api.config';
import { AppResumeService } from '../../../core/native/app-resume.service';
import { AppNotification, NotificationPage, NotificationQuery, NotificationSummary } from '../interfaces/notification';

@Injectable({ providedIn: 'root' })
export class NotificationInboxService {
  private readonly api = inject(ApiClient);
  private readonly apiConfig = inject(API_CONFIG);
  private readonly auth = inject(AuthStore);
  private readonly document = inject(DOCUMENT);
  private readonly resume = inject(AppResumeService);
  private readonly refreshRequested = new Subject<void>();
  private readonly count = signal(0);
  private readonly revision = signal(0);
  readonly sessionId = computed(() => this.auth.isAuthenticated()
    && this.auth.user()?.permissions.includes('can_view_notifications')
    ? this.auth.session()?.id ?? null
    : null);

  readonly unreadCount = this.count.asReadonly();
  readonly version = this.revision.asReadonly();

  constructor() {
    effect((onCleanup) => {
      this.count.set(0);
      if (!this.sessionId()) return;

      let echo: Echo<'reverb'> | undefined;
      let activeChannel: string | undefined;
      const visible = fromEvent(this.document, 'visibilitychange').pipe(
        filter(() => this.document.visibilityState === 'visible'),
      );
      const subscription = merge(this.refreshRequested, this.resume.resumed, visible).pipe(
        startWith(null),
        switchMap(() => forkJoin({
          summary: this.api.get<{ data: NotificationSummary }>('notificaciones/resumen')
            .pipe(catchError(() => of(null))),
          unread: this.list({ view: 'unread', order: 'fecha', perPage: 1 }).pipe(
            map(({ meta }) => meta.total),
            catchError(() => of(null)),
          ),
        })),
      ).subscribe(({ summary, unread }) => {
        if (unread !== null) this.count.set(unread);
        this.revision.update((version) => version + 1);
        if (!summary) return;
        const connection = summary.data.tiempo_real;
        if (activeChannel === connection?.canal) return;

        echo?.disconnect();
        echo = connection ? this.connect(connection) : undefined;
        activeChannel = connection?.canal;
      });

      onCleanup(() => {
        subscription.unsubscribe();
        echo?.disconnect();
      });
    });
  }

  list({ page = 1, perPage = 20, order, urgency, view }: NotificationQuery) {
    return this.api.get<NotificationPage>('notificaciones', {
      params: {
        page,
        per_page: perPage,
        orden: order,
        urgencia: urgency,
        estado_lectura: view === 'unread' ? 'no_leida' : undefined,
        estado_resolucion: view === 'resolved' ? 'resuelto' : 'vigente',
      },
    });
  }

  markRead(id: string) {
    return this.api.patch<{ data: AppNotification }>(
      `notificaciones/${encodeURIComponent(id)}/lectura`, {},
    );
  }

  refresh(): void {
    this.refreshRequested.next();
  }

  private connect({ canal, clave }: NonNullable<NotificationSummary['tiempo_real']>): Echo<'reverb'> {
    const origin = new URL(this.apiConfig.baseUrl, this.document.baseURI);
    const secure = origin.protocol === 'https:';
    const port = Number(origin.port || (secure ? 443 : 80));
    const client = new Pusher(clave, {
      cluster: '',
      wsHost: origin.hostname,
      wsPort: port,
      wssPort: port,
      forceTLS: secure,
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
      channelAuthorization: {
        customHandler: ({ socketId, channelName }, callback) => {
          this.api.post<{ auth: string }>('notificaciones/canal', {
            socket_id: socketId, channel_name: channelName,
          }).subscribe({
            next: (data) => callback(null, data),
            error: () => callback(new Error('No se pudo autorizar el canal.'), null),
          });
        },
      },
    });
    const echo = new Echo({ broadcaster: 'reverb', client });
    echo.private(canal).listen('.notifications.changed', () => this.refresh())
      .subscribed(() => this.refresh());
    return echo;
  }
}
