import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, createOutline } from 'ionicons/icons';
import { combineLatest, distinctUntilChanged, map } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FeedConsumptionChartComponent } from '../../components/feed-consumption-chart/feed-consumption-chart.component';
import { FeedingEditorComponent } from '../../components/feeding-editor/feeding-editor.component';
import { FeedBalance, FeedConsumption, FeedCorrectionInput, FeedingChange, FeedingRecipeOption, FeedingSubmission, FlockFeeding, ManualFeedingInput } from '../../interfaces/flock-feeding.interface';
import { Flock } from '../../interfaces/flock.interface';
import { dailyFeedPoints, feedingDate, feedSummary, formatFeedKg, snapshotRecipeName } from '../../services/feeding-summary';
import { FlockDetailService, dateBefore, todayInLotsTimezone } from '../../services/flock-detail.service';
import { FlockFeedingService } from '../../services/flock-feeding.service';
import { FeedingLoadState, FeedingPeriod } from '../../types/feeding-state.type';

@Component({
  selector: 'app-flock-feeding-page',
  imports: [RouterLink, IonIcon, IonSpinner, FeedConsumptionChartComponent, FeedingEditorComponent],
  templateUrl: './flock-feeding.page.html',
  styleUrl: './flock-feeding.page.scss',
})
export class FlockFeedingPage {
  private readonly api = inject(FlockFeedingService);
  private readonly detail = inject(FlockDetailService);
  private readonly units = inject(ProductionUnitsService);
  private readonly unitContext = inject(AdminUnitContextService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private epoch = 0;
  private currentVersion = 0;
  private historyVersion = 0;
  private balanceVersion = 0;
  private editorVersion = 0;
  private attempt: { fingerprint: string; key: string } | null = null;

  readonly flockId = signal('');
  readonly flock = signal<Flock | null>(null);
  readonly state = signal<FeedingLoadState>('loading');
  readonly currentState = signal<FeedingLoadState>('loading');
  readonly historyState = signal<FeedingLoadState>('loading');
  readonly balanceState = signal<FeedingLoadState>('loading');
  readonly feeding = signal<FlockFeeding | null>(null);
  readonly changes = signal<FeedingChange[]>([]);
  readonly records = signal<FeedConsumption[]>([]);
  readonly balances = signal<FeedBalance[]>([]);
  readonly houseName = signal<string | null>(null);
  readonly period = signal<FeedingPeriod>('7');
  readonly recipeId = signal<number | null>(null);
  readonly today = signal(todayInLotsTimezone());
  readonly page = signal(1);
  readonly pageSize = 20;
  readonly lastPage = computed(() => Math.max(1, Math.ceil(this.records().length / this.pageSize)));
  readonly unitName = computed(() => this.unitContext.units().find((unit) => unit.id === this.flock()?.production_unit_id)?.name ?? null);
  readonly backLink = computed(() => `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}`);
  readonly recipeNames = computed(() => {
    const names = new Map<number, string>();
    const current = this.feeding();
    if (current) {
      const name = snapshotRecipeName(current.etapa, current.receta_id);
      if (name) names.set(current.receta_id, name);
    }
    for (const record of this.records()) {
      const name = snapshotRecipeName(record.etapa, record.receta_id);
      if (name && !names.has(record.receta_id)) names.set(record.receta_id, name);
    }
    for (const balance of this.balances()) names.set(balance.receta_id, balance.nombre_receta);
    return names;
  });
  readonly currentRecipe = computed(() => {
    const id = this.feeding()?.receta_id;
    return id ? this.recipeNames().get(id) ?? `Receta #${id}` : '';
  });
  readonly modeLabel = computed(() => {
    const feeding = this.feeding();
    if (feeding?.modo !== 'manual') return 'Automático · Plan de manejo';
    const change = this.changes().find((item) => item.id === feeding.id);
    const actor = this.auth.user();
    const name = actor && change?.created_by === actor.id ? actor.name : 'Responsable no disponible';
    return `Manual - ${name}`;
  });
  readonly summary = computed(() => feedSummary(this.records(), this.recipeNames()));
  readonly total = computed(() => formatFeedKg(this.summary().reduce((total, row) => total + BigInt(row.grams), 0n).toString()));
  readonly selectedRecipeName = computed(() => this.recipeNames().get(this.recipeId() ?? -1) ?? `Receta #${this.recipeId()}`);
  readonly fromDate = computed(() => this.period() === 'all' ? null : dateBefore(this.today(), Number(this.period()) - 1));
  readonly points = computed(() => dailyFeedPoints(this.records(), this.recipeId(), this.fromDate(), this.today()));
  readonly periodTotal = computed(() => formatFeedKg(this.points().reduce((sum, point) => sum + BigInt(point.grams), 0n).toString()));
  readonly rangeText = computed(() => `${this.fromDate() ? feedingDate(this.fromDate()!) : 'Desde el primer registro'} al ${feedingDate(this.today())}`);
  readonly historyRows = computed(() => this.records().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize)
    .map((record) => ({ ...record, dateText: feedingDate(record.fecha), quantityText: formatFeedKg(record.cantidad_g),
      name: this.recipeNames().get(record.receta_id) ?? `Receta #${record.receta_id}`,
      corrected: record.cantidad_g !== record.original.cantidad_g || record.receta_id !== record.original.receta_id })));
  readonly canChange = computed(() => !!this.auth.user() && this.currentState() === 'ready' && !!this.feeding()
    && !this.feeding()?.finalizado && this.flock()?.status !== 'finished');
  readonly editor = signal<'manual' | 'correction' | null>(null);
  readonly editorOpen = signal(false);
  readonly editing = signal<FeedConsumption | null>(null);
  readonly editorBalances = signal<FeedBalance[]>([]);
  readonly editorState = signal<FeedingLoadState>('loading');
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly editorContext = computed(() => {
    const record = this.editing();
    return record ? `${feedingDate(record.fecha)} · ${this.recipeNames().get(record.receta_id) ?? 'Receta #' + record.receta_id}`
      : `Lote ${this.flock()?.code ?? ''} · ${this.currentRecipe()}`;
  });
  readonly editorOptions = computed<FeedingRecipeOption[]>(() => {
    const record = this.editing();
    const unit = record?.up_id ?? this.flock()?.production_unit_id;
    const balances = record ? this.editorBalances() : this.balances();
    const options = new Map<number, FeedingRecipeOption>();
    for (const balance of balances) {
      if (balance.up_id !== unit || (!record && (balance.estado_receta !== 'active' || BigInt(balance.saldo_g) <= 0n))) continue;
      options.set(balance.receta_id, { id: balance.receta_id, name: balance.nombre_receta,
        balance: balance.saldo_g, inactive: balance.estado_receta === 'inactive' });
    }
    if (record) {
      for (const id of [record.receta_id, record.original.receta_id]) {
        if (!options.has(id)) options.set(id, { id, name: this.recipeNames().get(id)
          ?? snapshotRecipeName(record.etapa, id) ?? `Receta #${id}`, balance: null, inactive: false });
      }
    }
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id - b.id);
  });
  readonly formatKg = formatFeedKg;

  constructor() {
    addIcons({ arrowBackOutline, createOutline });
    combineLatest([this.route.paramMap, toObservable(this.auth.user).pipe(map((user) => user?.id ?? null), distinctUntilChanged())])
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(([params, actor]) => {
        this.flockId.set(params.get('id') ?? '');
        this.load(!!actor);
      });
    this.destroyRef.onDestroy(() => this.epoch++);
  }

  load(authenticated = !!this.auth.user()): void {
    const epoch = ++this.epoch;
    this.currentVersion++; this.historyVersion++; this.balanceVersion++; this.editorVersion++;
    this.flock.set(null); this.feeding.set(null); this.records.set([]); this.balances.set([]); this.changes.set([]);
    this.saving.set(false); this.closeEditor();
    this.houseName.set(null); this.saving.set(false); this.saveError.set(null); this.success.set(null); this.attempt = null;
    this.recipeId.set(null); this.page.set(1); this.today.set(todayInLotsTimezone());
    this.state.set('loading'); this.currentState.set('loading'); this.historyState.set('loading'); this.balanceState.set('loading');
    if (!authenticated) { this.state.set('forbidden'); return; }
    if (!this.flockId()) { this.state.set('not-found'); return; }
    this.detail.flock(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (flock) => {
        if (epoch !== this.epoch) return;
        this.flock.set(flock); this.state.set('ready');
        this.loadCurrent(); this.loadHistory(); this.loadBalances();
        this.units.getPoultryHouseById(flock.poultry_house_id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (response) => { if (epoch === this.epoch) this.houseName.set(response.data.name); },
          error: () => { if (epoch === this.epoch) this.houseName.set('Galpón no disponible'); },
        });
      },
      error: (error: unknown) => { if (epoch === this.epoch) this.state.set(this.errorState(error)); },
    });
  }

  loadCurrent(): void {
    const epoch = this.epoch; const version = ++this.currentVersion;
    this.currentState.set('loading'); this.feeding.set(null); this.changes.set([]);
    this.api.current(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (feeding) => {
        if (epoch !== this.epoch || version !== this.currentVersion) return;
        this.feeding.set(feeding); this.currentState.set('ready');
        if (feeding.modo === 'manual') this.api.latestChanges(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (changes) => { if (epoch === this.epoch && version === this.currentVersion) this.changes.set(changes); },
          error: () => { /* The actor name is optional; never block feeding consultation. */ },
        });
      },
      error: (error: unknown) => { if (epoch === this.epoch && version === this.currentVersion) this.currentState.set(this.errorState(error)); },
    });
  }

  loadHistory(): void {
    const epoch = this.epoch; const version = ++this.historyVersion;
    this.historyState.set('loading'); this.records.set([]);
    this.api.consumptions(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (records) => {
        if (epoch !== this.epoch || version !== this.historyVersion) return;
        this.records.set([...records].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
        this.page.set(Math.min(this.page(), this.lastPage()));
        if (!this.summary().some((item) => item.recipeId === this.recipeId())) {
          this.recipeId.set(this.summary().find((item) => item.recipeId === this.feeding()?.receta_id)?.recipeId ?? this.summary()[0]?.recipeId ?? null);
        }
        this.historyState.set('ready');
      },
      error: (error: unknown) => { if (epoch === this.epoch && version === this.historyVersion) this.historyState.set(this.errorState(error)); },
    });
  }

  loadBalances(): void {
    const unit = this.flock()?.production_unit_id;
    if (!unit) return;
    const epoch = this.epoch; const version = ++this.balanceVersion;
    this.balanceState.set('loading'); this.balances.set([]);
    this.api.balances(unit).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (balances) => { if (epoch === this.epoch && version === this.balanceVersion) { this.balances.set(balances); this.balanceState.set('ready'); } },
      error: (error: unknown) => { if (epoch === this.epoch && version === this.balanceVersion) this.balanceState.set(this.errorState(error)); },
    });
  }

  changeRecipe(value: string): void { this.recipeId.set(this.summary().find((item) => item.recipeId === Number(value))?.recipeId ?? null); }
  changePeriod(value: string): void { if (value === '7' || value === '30' || value === 'all') { this.period.set(value); this.today.set(todayInLotsTimezone()); } }
  changePage(page: number): void { this.page.set(Math.max(1, Math.min(page, this.lastPage()))); }

  openManual(): void {
    if (!this.canChange() || this.saving() || this.editor()) return;
    this.editing.set(null); this.editor.set('manual'); this.saveError.set(null); this.success.set(null);
    this.editorOpen.set(true);
    this.loadBalances();
  }

  openEdit(record: FeedConsumption): void {
    if (this.saving() || !this.auth.user() || this.editor()) return;
    this.editing.set(record); this.editor.set('correction'); this.saveError.set(null); this.success.set(null);
    this.editorOpen.set(true);
    this.loadEditorBalances();
  }

  loadEditorBalances(): void {
    const record = this.editing(); if (!record) return;
    const epoch = this.epoch; const version = ++this.editorVersion;
    this.editorState.set('loading'); this.editorBalances.set([]);
    this.api.balances(record.up_id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (balances) => { if (epoch === this.epoch && version === this.editorVersion) { this.editorBalances.set(balances); this.editorState.set('ready'); } },
      error: (error: unknown) => { if (epoch === this.epoch && version === this.editorVersion) this.editorState.set(this.errorState(error)); },
    });
  }

  closeEditor(): void {
    if (this.saving()) return;
    // Keep the editor mounted until Ionic finishes dismissing its overlay.
    this.editorOpen.set(false);
  }

  editorDismissed(): void {
    this.editorOpen.set(false);
    this.editorVersion++; this.editor.set(null); this.editing.set(null); this.editorBalances.set([]); this.saveError.set(null);
  }

  save(submission: FeedingSubmission): void {
    const mode = this.editor(); const record = this.editing();
    if (!mode || !this.editorOpen() || this.saving() || !this.auth.user() || (mode === 'manual' && !this.canChange())) return;
    const automatic = mode === 'manual' && submission.mode === 'automatico';
    if (automatic && this.feeding()?.modo === 'automatico') return;
    if (mode === 'correction' && (!record || !submission.reason.trim())) return;
    if (!automatic && submission.recipeId !== null && !this.editorOptions().some((option) => option.id === submission.recipeId)) {
      this.saveError.set('La receta ya no está disponible. Revisá la selección.'); return;
    }
    if (!automatic && submission.recipeId === null && submission.grams === null) return;
    const recipe = submission.recipeId === null ? {} : { receta_id: submission.recipeId };
    const request: ManualFeedingInput | FeedCorrectionInput = automatic ? {} : mode === 'manual'
      ? { ...recipe, ...(submission.grams === null ? {} : { cantidad_diaria_g: submission.grams }) }
      : { ...recipe, ...(submission.grams === null ? {} : { cantidad_g: submission.grams }), motivo: submission.reason.trim() };
    const fingerprint = JSON.stringify([this.flockId(), automatic ? 'automatico' : mode, record?.id ?? null, request]);
    if (this.attempt?.fingerprint !== fingerprint) this.attempt = { fingerprint, key: crypto.randomUUID() };
    const epoch = this.epoch;
    this.saving.set(true); this.saveError.set(null);
    const operation = automatic ? this.api.automatic(this.flockId(), this.attempt.key) : mode === 'manual' ? this.api.change(this.flockId(), request, this.attempt.key)
      : this.api.correct(this.flockId(), record!.id, request as FeedCorrectionInput, this.attempt.key);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (epoch !== this.epoch) return;
        this.attempt = null; this.saving.set(false); this.closeEditor();
        this.success.set(automatic ? 'Alimentación actualizada en modo automático según el plan vigente.' : mode === 'manual' ? 'Alimentación actualizada en modo manual desde hoy.' : 'Consumo editado. Se conservó el historial original.');
        this.loadCurrent(); this.loadHistory(); this.loadBalances();
      },
      error: (error: unknown) => {
        if (epoch !== this.epoch) return;
        this.saving.set(false); this.saveError.set(this.errorMessage(error));
        if (error instanceof HttpErrorResponse && [401, 403, 409, 422].includes(error.status)) this.attempt = null;
      },
    });
  }

  private errorState(error: unknown): FeedingLoadState {
    if (!(error instanceof HttpErrorResponse)) return 'error';
    return error.status === 0 ? 'offline' : error.status === 404 ? 'not-found' : [401, 403].includes(error.status) ? 'forbidden' : 'error';
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No se pudo guardar. Podés reintentar con los mismos datos.';
    const body: unknown = error.error;
    const problem = body && typeof body === 'object' ? body as Record<string, unknown> : null;
    const errors = problem?.['errors'];
    if (errors && typeof errors === 'object') {
      const messages = Object.values(errors).flat().filter((value): value is string => typeof value === 'string');
      if (messages.length) return messages.join(' ');
    }
    const message = problem?.['detail'] ?? problem?.['message'];
    if (typeof message === 'string') return message;
    return error.status === 0 ? 'Sin conexión. Reintentá con los mismos datos al recuperar la conexión.' : 'No se pudo guardar el cambio. Revisá los datos e intentá nuevamente.';
  }
}
