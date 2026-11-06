import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonIcon, IonPopover } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, closeOutline, notificationsOutline } from 'ionicons/icons';
import { catchError, map, of, switchMap } from 'rxjs';

import { NotificationInboxService } from '../services/notification-inbox.service';
import { NotificationHeadingComponent } from './notification-heading.component';

@Component({
  selector: 'app-notification-bell',
  imports: [IonIcon, IonPopover, RouterLink, NotificationHeadingComponent],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent {
  private readonly inbox = inject(NotificationInboxService);
  readonly inboxPath = input('/notificaciones');
  readonly triggerEvent = signal<Event | undefined>(undefined);
  readonly unread = this.inbox.unreadCount;
  private readonly retry = signal(0);
  private readonly query = computed(() => this.triggerEvent() && this.inbox.sessionId()
    ? { session: this.inbox.sessionId(), version: this.inbox.version(), retry: this.retry() }
    : null);
  private readonly result = toSignal(toObservable(this.query).pipe(
    switchMap((query) => query
      ? this.inbox.list({ perPage: 5, order: 'fecha', view: 'all' }).pipe(
        map(({ data }) => ({ data, failed: false, session: query.session })),
        catchError(() => of({ data: null, failed: true, session: query.session })),
      )
      : of(null)),
  ), { initialValue: null });
  readonly recent = computed(() => {
    const result = this.result();
    return result?.session === this.inbox.sessionId() ? result : null;
  });

  constructor() {
    addIcons({
      'arrow-forward-outline': arrowForwardOutline,
      'close-outline': closeOutline,
      'notifications-outline': notificationsOutline,
    });
  }

  reload(): void {
    this.retry.update((value) => value + 1);
  }
}
