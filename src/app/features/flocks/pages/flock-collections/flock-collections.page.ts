import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, chevronForwardOutline, closeOutline, eggOutline, statsChartOutline, documentTextOutline } from 'ionicons/icons';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { CollectionChartComponent } from '../../components/collection-chart/collection-chart.component';
import { CollectionFormComponent } from '../../components/collection-form/collection-form.component';
import { CollectionRecordDialogComponent } from '../../components/collection-record-dialog/collection-record-dialog.component';
import { CollectionSummaryComponent } from '../../components/collection-summary/collection-summary.component';
import { CollectionSummary, FlockCollection, RecordCollectionRequest } from '../../interfaces/flock-collection.interface';
import { DetailMetric, EggMetricDay } from '../../interfaces/flock-detail.interface';
import { Flock } from '../../interfaces/flock.interface';
import { collectionDate, collectionGrouping, collectionLocalDateTime, collectionNumber, collectionPeriodAverage, collectionPoints, collectionRange, collectionSummary } from '../../services/collection-summary';
import { FlockCollectionsService } from '../../services/flock-collections.service';
import { FlockDetailService, todayInLotsTimezone } from '../../services/flock-detail.service';
import { CollectionPeriod } from '../../types/collection-period.type';

type LoadState = 'loading' | 'ready' | 'offline' | 'forbidden' | 'not-found' | 'error';

@Component({
  selector: 'app-flock-collections-page',
  imports: [RouterLink, IonIcon, IonSpinner, CollectionChartComponent, CollectionSummaryComponent, CollectionFormComponent, CollectionRecordDialogComponent],
  templateUrl: './flock-collections.page.html',
  styleUrl: './flock-collections.page.scss',
})
export class FlockCollectionsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly detail = inject(FlockDetailService);
  private readonly api = inject(FlockCollectionsService);
  private readonly units = inject(ProductionUnitsService);
  private readonly unitContext = inject(AdminUnitContextService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private version = 0;
  private historyVersion = 0;
  private metricsVersion = 0;
  private attempt: { fingerprint: string; request: RecordCollectionRequest; key: string } | null = null;
  private readonly registration = viewChild(CollectionFormComponent);
  private readonly detailDialog = viewChild(CollectionRecordDialogComponent);
  readonly flockId = signal('');
  readonly flock = signal<Flock | null>(null);
  readonly state = signal<LoadState>('loading');
  readonly metricsState = signal<LoadState>('loading');
  readonly historyState = signal<LoadState>('loading');
  readonly days = signal<EggMetricDay[]>([]);
  readonly records = signal<FlockCollection[]>([]);
  readonly currentPage = signal(0);
  readonly lastPage = signal(0);
  readonly totalRecords = signal(0);
  readonly loadingMore = signal(false);
  readonly moreError = signal<string | null>(null);
  readonly houseName = signal('');
  readonly today = signal(todayInLotsTimezone());
  readonly period = signal<CollectionPeriod>('week');
  readonly selectedDate = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly success = signal<string | null>(null);
  readonly backLink = computed(() => `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}`);
  readonly unitName = computed(() => this.unitContext.units().find((unit) => unit.id === this.flock()?.production_unit_id)?.name);
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-collections.manage') === true);
  readonly canCollect = computed(() => this.canManage() && this.flock()?.status !== 'finished' && (this.flock()?.current_quantity ?? 0) > 0);
  readonly summary = computed<DetailMetric<CollectionSummary>>(() => ({
    state: this.metricsState() === 'ready' ? 'ready' : this.metricsState() === 'loading' ? 'loading' : 'unavailable',
    value: this.metricsState() === 'ready' && this.flock() ? collectionSummary(this.days(), this.flock()!.entry_date, this.today()) : null,
  }));
  readonly range = computed(() => collectionRange(this.period(), this.flock()?.entry_date ?? this.today(), this.today(), this.firstHistoricalDate()));
  readonly rangeText = computed(() => `${collectionDate(this.range().from)} – ${collectionDate(this.range().to)}`);
  readonly grouping = computed(() => collectionGrouping(this.period(), this.range().from, this.range().to));
  readonly groupingText = computed(() => ({ day: 'Puntos diarios', week: 'Promedios semanales', month: 'Promedios mensuales' })[this.grouping()]);
  readonly seriesLabel = computed(() => this.grouping() === 'day' ? 'Postura diaria' : 'Promedio diario del intervalo');
  readonly points = computed(() => collectionPoints(this.days(), this.range().from, this.range().to, this.grouping(), this.firstHistoricalDate()));
  readonly firstHistoricalDate = computed(() => this.days().reduce<string | null>((first, day) =>
    first === null || day.date < first ? day.date : first, null));
  readonly hasPoints = computed(() => this.points().some((point) => point.quantity !== null));
  readonly average = computed(() => collectionPeriodAverage(this.points()));
  readonly averageText = computed(() => this.average() === null ? '' : collectionNumber(this.average()!));
  readonly selected = computed(() => this.points().find((point) => point.date === this.selectedDate())
    ?? [...this.points()].reverse().find((point) => point.quantity !== null) ?? this.points().at(-1));
  readonly selectedQuantity = computed(() => this.selected()?.quantity === null ? 'Sin registro' : `${collectionNumber(this.selected()?.quantity ?? 0)} huevos/día`);
  readonly history = computed(() => this.records().map((record) => ({ ...record,
    dateText: collectionDate(todayInLotsTimezone(new Date(record.occurred_at))),
    timeText: collectionLocalDateTime(record.occurred_at).slice(11), quantityText: collectionNumber(record.quantity),
  })));

  constructor() {
    addIcons({ addOutline, arrowBackOutline, chevronForwardOutline, closeOutline, eggOutline, statsChartOutline, documentTextOutline });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.flockId.set(params.get('id') ?? '');
      this.attempt = null;
      this.period.set('week');
      this.success.set(null);
      this.load();
    });
  }

  load(): void {
    const version = ++this.version;
    ++this.historyVersion; ++this.metricsVersion;
    this.state.set('loading'); this.flock.set(null); this.houseName.set(''); this.saving.set(false);
    this.saveError.set(null); this.fieldErrors.set({});
    this.detail.flock(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (flock) => {
        if (version !== this.version) return;
        this.flock.set(flock); this.state.set('ready');
        this.units.getPoultryHouseById(flock.poultry_house_id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (response) => { if (version === this.version) this.houseName.set(response.data.name); },
          error: () => { if (version === this.version) this.houseName.set('Galpón no disponible'); },
        });
        this.refreshData();
      },
      error: (error: unknown) => { if (version === this.version) this.state.set(this.errorState(error)); },
    });
  }

  refreshData(): void { this.loadMetrics(); this.loadHistory(); }

  loadMetrics(): void {
    const flock = this.flock();
    if (!flock) return;
    const version = ++this.metricsVersion;
    this.today.set(todayInLotsTimezone());
    this.metricsState.set('loading'); this.days.set([]); this.selectedDate.set(null);
    this.api.days(flock.id, flock.entry_date, this.today()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (days) => { if (version === this.metricsVersion) { this.days.set(days); this.metricsState.set('ready'); } },
      error: (error: unknown) => { if (version === this.metricsVersion) this.metricsState.set(this.errorState(error)); },
    });
  }

  loadHistory(append = false): void {
    if (append && (this.loadingMore() || this.currentPage() >= this.lastPage())) return;
    const version = ++this.historyVersion;
    const page = append ? this.currentPage() + 1 : 1;
    this.moreError.set(null); this.loadingMore.set(append);
    if (!append) { this.historyState.set('loading'); this.records.set([]); }
    this.api.history(this.flockId(), page).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (version !== this.historyVersion) return;
        this.records.update((records) => append ? [...records, ...response.data.filter((item) => !records.some((record) => record.id === item.id))] : response.data);
        this.currentPage.set(response.meta.current_page); this.lastPage.set(response.meta.last_page); this.totalRecords.set(response.meta.total);
        this.loadingMore.set(false); this.historyState.set('ready');
      },
      error: (error: unknown) => {
        if (version !== this.historyVersion) return;
        this.loadingMore.set(false);
        if (append) this.moreError.set('No se pudieron cargar más registros. Reintentá.');
        else this.historyState.set(this.errorState(error));
      },
    });
  }

  changePeriod(period: CollectionPeriod): void { this.period.set(period); this.selectedDate.set(null); }
  selectDate(event: Event): void { this.selectedDate.set((event.target as HTMLSelectElement).value); }
  openRecord(record: FlockCollection, trigger: HTMLElement | null = null): void { this.detailDialog()?.open(record, trigger); }
  onRecordChanged(action: 'edited' | 'deleted'): void {
    this.success.set(action === 'edited' ? 'Postura actualizada. La producción y las existencias se actualizaron.' : 'Postura borrada. Se ajustaron la producción y las existencias; se conservó el historial.');
    this.refreshData();
  }

  save(request: RecordCollectionRequest): void {
    if (this.saving() || !this.canCollect()) return;
    this.saveError.set(null); this.fieldErrors.set({}); this.success.set(null);
    const fingerprint = JSON.stringify([this.flockId(), request]);
    const attempt = this.attempt?.fingerprint === fingerprint ? this.attempt : { fingerprint, request, key: crypto.randomUUID() };
    this.attempt = attempt;
    const version = this.version;
    this.saving.set(true);
    this.api.record(this.flockId(), attempt.request, attempt.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (version !== this.version) return;
        this.saving.set(false); this.attempt = null;
        this.registration()?.saved(); this.success.set('Postura registrada. El inventario de huevos se actualizó.'); this.refreshData();
      },
      error: (error: unknown) => {
        if (version !== this.version) return;
        this.saving.set(false);
        if (!(error instanceof HttpErrorResponse)) { this.saveError.set('No se pudo guardar. Reintentá con los mismos datos.'); return; }
        const body: unknown = error.error;
        const problem = body && typeof body === 'object' ? body as Record<string, unknown> : null;
        if ([401, 403, 404, 409, 422].includes(error.status)) this.attempt = null;
        if (error.status === 422) {
          const errors = problem?.['errors'];
          const fields: Record<string, string> = {};
          if (errors && typeof errors === 'object') for (const [key, values] of Object.entries(errors)) {
            const message: unknown = Array.isArray(values) ? values.find((value: unknown) => typeof value === 'string') : null;
            if (typeof message === 'string') fields[key] = message;
          }
          this.fieldErrors.set(fields); this.saveError.set('Revisá los campos señalados.');
        } else if (error.status === 401 || error.status === 403) this.saveError.set('No tenés permiso para recolectar huevos.');
        else if (error.status === 409) {
          this.saveError.set(typeof problem?.['detail'] === 'string' ? problem['detail'] : 'El lote cambió. Revisá los datos antes de reintentar.');
          this.saving.set(true);
          this.detail.flock(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (flock) => { if (version === this.version) { this.flock.set(flock); this.saving.set(false); } },
            error: () => { if (version === this.version) { this.saving.set(false); this.saveError.update((message) => `${message} No se pudo actualizar el lote.`); } },
          });
        } else this.saveError.set(error.status === 0 ? 'Sin conexión. Reintentá con los mismos datos para evitar duplicados.' : 'No se pudo guardar. Reintentá con los mismos datos.');
      },
    });
  }

  private errorState(error: unknown): LoadState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) return 'not-found';
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 0) return 'offline';
    }
    return 'error';
  }
}
