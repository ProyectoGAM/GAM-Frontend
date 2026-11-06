import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { postLoginPath } from '../../../core/auth/access-policy';
import { AuthStore } from '../../../core/auth/auth.store';
import { NotificationPage } from '../interfaces/notification';
import { NotificationInboxService } from '../services/notification-inbox.service';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, RouterLink],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class NotificationsPage {
  private readonly auth = inject(AuthStore);
  private readonly inbox = inject(NotificationInboxService);
  private readonly markRequests = new Subject<string>();

  readonly allowed = computed(() => this.auth.user()?.permissions.includes('can_view_notifications') === true);
  readonly returnPath = computed(() => postLoginPath(this.auth.user()));
  readonly page = signal(1);
  readonly unreadOnly = signal(false);
  readonly error = signal('');
  readonly saving = signal<string | null>(null);
  private readonly retry = signal(0);
  private readonly query = computed(() => ({
    allowed: this.allowed(), session: this.auth.session()?.id, page: this.page(), unreadOnly: this.unreadOnly(),
    version: this.inbox.version(), retry: this.retry(),
  }));

  readonly state = toSignal(toObservable(this.query).pipe(
    switchMap(({ allowed, page, unreadOnly }) => allowed ? this.inbox.list(page, unreadOnly).pipe(
      map((result) => ({ result, failed: false })),
      startWith({ result: null, failed: false }),
      catchError(() => of({ result: null, failed: true })),
    ) : of({ result: null, failed: false })),
  ), { initialValue: { result: null as NotificationPage | null, failed: false } });

  constructor() {
    this.markRequests.pipe(
      switchMap((id) => this.inbox.markRead(id).pipe(
        map(() => true),
        catchError(() => of(false)),
      )),
      takeUntilDestroyed(),
    ).subscribe((saved) => {
      this.saving.set(null);
      if (saved) {
        this.reload();
        this.inbox.refresh();
      } else {
        this.error.set('No se pudo marcar la notificación como leída.');
      }
    });
  }

  setFilter(unreadOnly: boolean): void {
    this.unreadOnly.set(unreadOnly);
    this.page.set(1);
  }

  reload(): void {
    this.retry.update((value) => value + 1);
  }

  markRead(id: string): void {
    this.error.set('');
    this.saving.set(id);
    this.markRequests.next(id);
  }
}
