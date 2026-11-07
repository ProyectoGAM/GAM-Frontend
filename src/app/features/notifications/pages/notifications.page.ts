import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonToolbar } from '@ionic/angular';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { isAdminUser, postLoginPath } from '../../../core/auth/access-policy';
import { AuthStore } from '../../../core/auth/auth.store';
import { hasAnyPermission } from '../../../core/auth/permission-keys';
import { feedingDate, formatFeedKg, snapshotRecipeName } from '../../flocks/services/feeding-summary';
import { todayInLotsTimezone } from '../../flocks/services/flock-detail.service';
import { FlockFeedingService } from '../../flocks/services/flock-feeding.service';
import { AlertEditorDialogComponent } from '../components/alert-editor-dialog/alert-editor-dialog.component';
import { NotificationHeadingComponent } from '../components/notification-heading.component';
import { AppNotification, NotificationPage } from '../interfaces/notification';
import { NotificationInboxService } from '../services/notification-inbox.service';
import { NotificationOrder, NotificationUrgency, NotificationView } from '../types/notification.type';

interface FeedingReview {
  notification: AppNotification;
  flockId: string;
  trigger: HTMLButtonElement;
  state: 'loading' | 'ready' | 'saving' | 'unavailable' | 'retry';
  ration: { id: number; recipe: string; quantity: string; since: string } | null;
  key: string;
  error: string;
}

@Component({
  selector: 'app-notifications-page',
  imports: [NgTemplateOutlet, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonToolbar, RouterLink, NotificationHeadingComponent, AlertEditorDialogComponent],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class NotificationsPage {
  private readonly auth = inject(AuthStore);
  private readonly inbox = inject(NotificationInboxService);
  private readonly feeding = inject(FlockFeedingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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
  protected readonly review = linkedSignal<string | null, FeedingReview | null>({
    source: this.inbox.sessionId,
    computation: () => null,
  });
  protected readonly reviewMessage = signal('');
  private readonly canManageFeeding = computed(() => {
    const user = this.auth.user();
    return isAdminUser(user) || (hasAnyPermission(user?.permissions, 'can_view_flock_feeding')
      && hasAnyPermission(user?.permissions, 'can_manage_flock_feeding'));
  });
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

  protected canReview(notification: AppNotification): boolean {
    return this.canManageFeeding() && notification.tipo === 'manual_feeding_review_due'
      && notification.estado_resolucion === 'no_resuelto'
      && notification.entidad?.tipo === 'flock' && !!notification.entidad.id;
  }

  protected openReview(notification: AppNotification, trigger: HTMLButtonElement): void {
    const flockId = notification.entidad?.id;
    if (!flockId || !this.inbox.sessionId() || this.review() || !this.canReview(notification)) return;
    this.reviewMessage.set('');
    this.loadReview(notification, flockId, trigger);
  }

  protected retryReview(): void {
    const review = this.review();
    if (review?.state === 'retry') this.loadReview(review.notification, review.flockId, review.trigger);
  }

  protected closeReview(): void {
    const review = this.review();
    if (!review || review.state === 'saving') return;
    this.review.set(null);
    this.restoreFocus(review.trigger);
  }

  protected confirmReview(): void {
    const review = this.review();
    if (review?.state !== 'ready' || !review.ration || !this.canManageFeeding()) return;
    const pending: FeedingReview = { ...review, state: 'saving', error: '' };
    this.review.set(pending);
    this.feeding.confirmManual(review.flockId, review.ration.id, review.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (this.review() !== pending) return;
        this.review.set(null);
        this.reviewMessage.set('Ración confirmada. La alerta quedó resuelta.');
        this.reload();
        this.inbox.refresh();
        this.restoreFocus();
      },
      error: (error: unknown) => {
        if (this.review() !== pending) return;
        const conflict = error instanceof HttpErrorResponse && error.status === 409;
        this.review.set(conflict ? {
          ...review, state: 'retry', ration: null, error: 'La ración vigente cambió. Volvé a consultarla antes de confirmar.',
        } : {
          ...review, error: 'No se pudo confirmar la ración. Volvé a intentar.',
        });
      },
    });
  }

  private loadReview(notification: AppNotification, flockId: string, trigger: HTMLButtonElement): void {
    const request: FeedingReview = {
      notification, flockId, trigger, state: 'loading', ration: null, key: crypto.randomUUID(), error: '',
    };
    this.review.set(request);
    this.feeding.current(flockId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (feeding) => {
        if (this.review() !== request) return;
        const since = feeding.revision_manual_desde ?? feeding.fecha_vigencia;
        const noticeTime = Date.parse(notification.fecha);
        const newer = Date.parse(feeding.confirmada_en ?? '') >= noticeTime
          || (Number.isFinite(noticeTime) && since > todayInLotsTimezone(new Date(noticeTime)));
        if (feeding.finalizado || feeding.modo !== 'manual' || newer) {
          this.review.set({ ...request, state: 'unavailable', error: 'Esta alerta ya no corresponde a la ración manual vigente.' });
          return;
        }
        this.review.set({
          ...request, state: 'ready', ration: {
            id: feeding.id,
            recipe: snapshotRecipeName(feeding.etapa, feeding.receta_id) ?? `Receta #${feeding.receta_id}`,
            quantity: formatFeedKg(feeding.cantidad_diaria_g),
            since: feedingDate(since),
          },
        });
      },
      error: () => {
        if (this.review() === request) {
          this.review.set({ ...request, state: 'retry', error: 'No se pudo consultar la ración vigente.' });
        }
      },
    });
  }

  private restoreFocus(trigger?: HTMLElement): void {
    afterNextRender({
      write: () => {
        const target = trigger?.isConnected ? trigger : this.host.nativeElement.querySelector<HTMLElement>('.inbox h1');
        target?.focus({ preventScroll: true });
      },
    }, { injector: this.injector });
  }
}
