import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, checkmarkCircleOutline, closeCircleOutline, refreshOutline, searchOutline, timeOutline } from 'ionicons/icons';
import { EMPTY, Observable, Subject, catchError, filter, finalize, forkJoin, interval, map, merge, of, switchMap, tap } from 'rxjs';

import { AuthStore } from '../../core/auth/auth.store';
import { hasAnyPermission } from '../../core/auth/permission-keys';
import { AdminUnitContextService } from '../admin/services/admin-unit-context.service';
import { DeliveriesApi } from './deliveries.api';
import { Delivery, DeliveryListResponse, DeliveryStatus } from './delivery.models';

type DeliveryView = 'active' | 'history';
type HistoryStatus = Exclude<DeliveryStatus, 'active'>;
const PAGE_SIZE = 25;
const API_PAGE_SIZE = 100;

@Component({
  selector: 'app-admin-deliveries',
  templateUrl: './admin-deliveries.page.html',
  styleUrl: './admin-deliveries.page.scss',
  imports: [DatePipe, IonIcon, IonSpinner, RouterLink],
})
export class AdminDeliveriesPage {
  private readonly api = inject(DeliveriesApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly refreshRequests = new Subject<boolean>();
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private readonly returnFragment = toSignal(this.route.fragment, { initialValue: this.route.snapshot.fragment });
  private readonly deliveries = signal<Delivery[]>([]);
  private restoredFragment: string | null = null;

  readonly unitContext = inject(AdminUnitContextService);
  readonly canMonitor = computed(() => this.auth.isAdmin()
    || hasAnyPermission(this.auth.user()?.permissions, 'can_monitor_deliveries'));
  readonly view = computed<DeliveryView>(() => this.canMonitor() && this.params().get('vista') !== 'historial' ? 'active' : 'history');
  readonly search = computed(() => this.params().get('buscar') ?? '');
  readonly dateFrom = computed(() => this.validDate(this.params().get('desde')));
  readonly dateTo = computed(() => this.validDate(this.params().get('hasta')));
  readonly status = computed<HistoryStatus | ''>(() => {
    const value = this.params().get('estado');
    return value === 'completed' || value === 'cancelled' ? value : '';
  });
  readonly invalidRange = computed(() => !!this.dateFrom() && !!this.dateTo() && this.dateFrom() > this.dateTo());
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly incomplete = signal(false);
  readonly statusLabels: Record<DeliveryStatus, string> = { active: 'En curso', completed: 'Finalizado', cancelled: 'Cancelado' };
  readonly statusIcons: Record<DeliveryStatus, string> = { active: 'time-outline', completed: 'checkmark-circle-outline', cancelled: 'close-circle-outline' };

  readonly matching = computed(() => {
    const query = this.normalize(this.search());
    const terms = query.split(/\s+/).filter(Boolean);
    if (!terms.length) return this.deliveries();
    return this.deliveries().filter((delivery) => {
      const driver = this.normalize(delivery.driver?.name ?? '');
      const vehicle = this.normalize(delivery.vehicle?.plate ?? delivery.vehicle_reference ?? '');
      const plate = vehicle.replace(/[^a-z0-9]/g, '');
      return terms.every((term) => driver.includes(term) || vehicle.includes(term) || plate.includes(term.replace(/[^a-z0-9]/g, '') || term));
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.matching().length / PAGE_SIZE)));
  readonly page = computed(() => {
    const requested = Number(this.params().get('pagina'));
    return Number.isInteger(requested) ? Math.min(this.pageCount(), Math.max(1, requested)) : 1;
  });
  readonly rows = computed(() => this.matching().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE));

  private readonly apiFilters = computed(() => {
    const history = this.view() === 'history';
    return {
      view: this.view(),
      unitId: this.unitContext.selectedId(),
      dateFrom: history ? this.dateFrom() : '',
      dateTo: history ? this.dateTo() : '',
      status: history ? this.status() : '',
      invalidRange: history && this.invalidRange(),
    };
  }, { equal: (left, right) => left.view === right.view && left.unitId === right.unitId
    && left.dateFrom === right.dateFrom && left.dateTo === right.dateTo && left.status === right.status });

  constructor() {
    addIcons({ arrowForwardOutline, checkmarkCircleOutline, closeCircleOutline, refreshOutline, searchOutline, timeOutline });

    toObservable(this.apiFilters).pipe(
      switchMap((filters) => {
        this.deliveries.set([]);
        this.incomplete.set(false);
        this.error.set(false);
        if (filters.invalidRange) {
          this.loading.set(false);
          return EMPTY;
        }
        return merge(of(false), this.refreshRequests, interval(30_000).pipe(
          filter(() => filters.view === 'active' && !this.loading()),
          map(() => true),
        )).pipe(
          switchMap((background) => this.loadDeliveries(filters, background)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((deliveries) => this.deliveries.set(deliveries));

    effect(() => {
      const fragment = this.returnFragment();
      if (!fragment) this.restoredFragment = null;
      if (!fragment?.startsWith('reparto-') || fragment === this.restoredFragment || this.loading()
        || !this.rows().some((delivery) => `reparto-${delivery.id}` === fragment)) return;
      this.restoredFragment = fragment;
      afterNextRender(() => {
        const row = this.host.nativeElement.ownerDocument.getElementById(fragment);
        row?.scrollIntoView({ block: 'nearest' });
        row?.querySelector('a')?.focus({ preventScroll: true });
      }, { injector: this.injector });
    });
  }

  refresh(): void {
    this.refreshRequests.next(false);
  }

  setView(view: DeliveryView): void {
    this.setParams({ vista: view === 'history' ? 'historial' : 'en-curso', pagina: null });
  }

  setSearch(event: Event): void {
    this.setParams({ buscar: (event.target as HTMLInputElement).value || null, pagina: null });
  }

  setFilter(key: 'desde' | 'hasta' | 'estado', event: Event): void {
    this.setParams({ [key]: (event.target as HTMLInputElement | HTMLSelectElement).value || null, pagina: null });
  }

  setPage(page: number): void {
    this.setParams({ pagina: page <= 1 ? null : page });
    void this.host.nativeElement.closest<HTMLIonContentElement>('ion-content')?.scrollToTop(0);
  }

  private setParams(queryParams: Params): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private loadDeliveries(filters: ReturnType<typeof this.apiFilters>, background: boolean) {
    if (!background) {
      this.loading.set(true);
      this.error.set(false);
    }
    const params = { per_page: API_PAGE_SIZE, production_unit_id: filters.unitId };
    const historyStatus = (status: HistoryStatus) => this.api.list({
      ...params, status, date_from: filters.dateFrom || undefined, date_to: filters.dateTo || undefined,
    });
    const statuses: HistoryStatus[] = filters.status ? [filters.status] : ['completed', 'cancelled'];
    const request: Observable<DeliveryListResponse[]> = filters.view === 'active'
      ? this.api.current(params).pipe(map((response) => [response]))
      : forkJoin(statuses.map(historyStatus));
    return request.pipe(
      // The API returns pagination metadata but currently rejects the page query parameter.
      tap((responses) => this.incomplete.set(responses.some(({ meta }) => (meta?.last_page ?? 1) > 1))),
      map((responses) => responses.flatMap(({ data }) => data)
        .filter((delivery) => filters.view === 'active' ? delivery.status === 'active'
          : filters.status ? delivery.status === filters.status : delivery.status !== 'active')
        .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at) || right.id.localeCompare(left.id))),
      tap(() => this.error.set(false)),
      catchError(() => {
        if (!background) this.error.set(true);
        return EMPTY;
      }),
      finalize(() => { if (!background) this.loading.set(false); }),
    );
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  }

  private validDate(value: string | null): string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? '' : value;
  }
}
