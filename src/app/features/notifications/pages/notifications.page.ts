import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonToolbar } from '@ionic/angular';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { postLoginPath } from '../../../core/auth/access-policy';
import { AuthStore } from '../../../core/auth/auth.store';
import { NotificationHeadingComponent } from '../components/notification-heading.component';
import { NotificationPage } from '../interfaces/notification';
import { NotificationInboxService } from '../services/notification-inbox.service';
import { NotificationOrder, NotificationUrgency, NotificationView } from '../types/notification.type';

@Component({
  selector: 'app-notifications-page',
  imports: [NgTemplateOutlet, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonToolbar, RouterLink, NotificationHeadingComponent],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class NotificationsPage {
  private readonly auth = inject(AuthStore);
  private readonly inbox = inject(NotificationInboxService);
  private readonly markRequests = new Subject<string>();

  readonly embedded = input(false);
  readonly allowed = computed(() => this.auth.user()?.permissions.includes('can_view_notifications') === true);
  readonly returnPath = computed(() => postLoginPath(this.auth.user()));
  readonly page = signal(1);
  readonly view = signal<NotificationView>('all');
  readonly order = signal<NotificationOrder>('urgencia');
  readonly urgency = signal<NotificationUrgency | undefined>(undefined);
  readonly urgencyOptions: ReadonlyArray<{ value?: NotificationUrgency; label: string }> = [
    { label: 'Todas' }, { value: 'alto', label: 'Alta' }, { value: 'medio', label: 'Media' }, { value: 'bajo', label: 'Baja' },
  ];
  readonly views: ReadonlyArray<{ value: NotificationView; label: string }> = [
    { value: 'all', label: 'Todas' }, { value: 'unread', label: 'Sin leer' }, { value: 'resolved', label: 'Resueltas' },
  ];
  readonly emptyMessage = computed(() => {
    if (this.urgency()) return 'No hay avisos con esta urgencia.';
    if (this.view() === 'resolved') return 'No hay alertas resueltas.';
    if (this.view() === 'unread') return 'No hay avisos sin leer.';
    return 'No hay notificaciones pendientes.';
  });
  readonly error = signal('');
  readonly saving = signal<string | null>(null);
  private readonly retry = signal(0);
  private readonly query = computed(() => ({
    session: this.inbox.sessionId(), page: this.page(),
    order: this.order(), urgency: this.urgency(), view: this.view(),
    version: this.inbox.version(), retry: this.retry(),
  }));

  readonly state = toSignal(toObservable(this.query).pipe(
    switchMap(({ session, page, order, urgency, view }) => session ? this.inbox.list({ page, order, urgency, view }).pipe(
      map((result) => ({ result, failed: false })),
      startWith({ result: null, failed: false }),
      catchError(() => of({ result: null, failed: true })),
    ) : of({ result: null, failed: false })),
  ), { initialValue: { result: null as NotificationPage | null, failed: false } });

  constructor() {
    effect(() => {
      const lastPage = this.state().result?.meta.last_page;
      if (lastPage && this.page() > lastPage) this.page.set(lastPage);
    });
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

  setView(view: NotificationView): void {
    this.view.set(view);
    this.page.set(1);
  }

  setOrder(order: string): void {
    this.order.set(order === 'fecha' ? 'fecha' : 'urgencia');
    this.page.set(1);
  }

  setUrgency(urgency?: NotificationUrgency): void {
    this.urgency.set(urgency);
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
