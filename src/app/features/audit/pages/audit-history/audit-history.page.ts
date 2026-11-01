import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, ViewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { barChartOutline, businessOutline, carOutline, chevronForwardOutline, clipboardOutline, closeOutline, cubeOutline, documentsOutline, eggOutline, funnelOutline, layersOutline, peopleOutline, refreshOutline, shieldCheckmarkOutline, timeOutline } from 'ionicons/icons';
import { debounceTime, firstValueFrom, Subject } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { FeedConsumptionCorrectionComponent } from '../../../flocks/components/feed-consumption-correction/feed-consumption-correction.component';
import { MortalityUndoComponent } from '../../../flocks/components/mortality-undo/mortality-undo.component';
import { MovementReversalDialogComponent } from '../../../inventory/components/movement-reversal-dialog/movement-reversal-dialog.component';
import { InventoryApi } from '../../../inventory/services/inventory.api';
import { AuditAction, AuditActorOption, AuditDetail, AuditEntry, AuditFilters, AuditOptions, AuditPage } from '../../interfaces/audit';
import { actorFilters, actorKey, actorLabel, AUDIT_MODULES, auditTitle, moduleLabel, sourceLabel, unitLabel } from '../../services/audit-presentation';
import { auditFlockNavigation, auditUserLink, sameAction, supportedAction } from '../../services/audit-actions';
import { AuditService } from '../../services/audit.service';

@Component({
  selector: 'app-audit-history',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink, IonIcon, FilterDialogComponent, SearchableSelectComponent, MovementReversalDialogComponent, FeedConsumptionCorrectionComponent, MortalityUndoComponent],
  templateUrl: './audit-history.page.html', styleUrl: './audit-history.page.scss',
})
export class AuditHistoryPage {
  private readonly api = inject(AuditService);
  private readonly auth = inject(AuthStore);
  private readonly inventory = inject(InventoryApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private readonly searches = new Subject<{ search: string; context: string | undefined }>();
  private readonly actorCache = new Map<string, AuditActorOption>();
  private appliedActor: AuditActorOption | null = null;
  private loadVersion = 0;
  private optionsVersion = 0;
  private directoryVersion = 0;
  private detailVersion = 0;
  private actionVersion = 0;
  private detailTrigger: HTMLElement | null = null;
  private previousContext: string | undefined;
  @ViewChild(FilterDialogComponent) private filterDialog!: FilterDialogComponent;
  @ViewChild(MovementReversalDialogComponent) private reversalDialog!: MovementReversalDialogComponent;
  @ViewChild(FeedConsumptionCorrectionComponent) private feedCorrection!: FeedConsumptionCorrectionComponent;
  @ViewChild(MortalityUndoComponent) private mortalityUndo!: MortalityUndoComponent;
  @ViewChild('detailDialog', { static: true }) private detailDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('detailHeading', { static: true }) private detailHeading!: ElementRef<HTMLHeadingElement>;
  readonly modules = AUDIT_MODULES;
  readonly activeModule = computed(() => this.modules.find((module) => module.id === this.queryParams().get('modulo')) ?? this.modules[0]);
  readonly state = signal<'loading' | 'success' | 'empty' | 'error' | 'forbidden'>('loading');
  readonly error = signal('');
  readonly success = signal('');
  readonly entries = signal<AuditEntry[]>([]);
  readonly meta = signal<AuditPage['meta'] | null>(null);
  readonly options = signal<AuditOptions | null>(null);
  readonly optionsError = signal(false);
  readonly optionsLoading = signal(true);
  readonly responsibleResults = signal<AuditActorOption[]>([]);
  readonly responsibles = computed(() => this.responsibleResults().map((actor) => ({
    value: actorKey(actor), label: actorLabel({ ...actor, id: actor.value }),
    description: actor.status === 'disabled' ? 'Cuenta deshabilitada' : undefined,
  })));
  readonly responsibleLabel = signal<string | null>(null);
  readonly directoryState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly directoryPage = signal(0);
  readonly directoryLastPage = signal(1);
  readonly directorySearch = signal('');
  readonly eventOptions = computed(() => this.options()?.audit.events ?? []);
  readonly selectedEntry = signal<AuditEntry | null>(null);
  readonly detail = signal<AuditDetail | null>(null);
  readonly detailState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly detailError = signal('');
  readonly actionLoading = signal(false);
  readonly actionError = signal('');
  readonly selectedActorLink = computed(() => this.detail() ? auditUserLink(this.detail()!.actor) : null);
  readonly flockNavigation = computed(() => {
    const entry = this.detail();
    return entry ? auditFlockNavigation(entry) : null;
  });
  readonly referenceNames = computed(() => ({
    products: Object.fromEntries((this.options()?.products ?? []).map((option) => [Number(option.value), option.label])),
    locations: Object.fromEntries((this.options()?.stock_locations ?? []).map((option) => [Number(option.value), option.label])),
  }));
  readonly applied = signal<AuditFilters>({});
  readonly filterCount = computed(() => ['from', 'to', 'event', 'source', 'actor_kind', 'up_id'].filter((key) => this.applied()[key as keyof AuditFilters] !== undefined).length);
  readonly rows = computed(() => this.entries().map((entry) => ({
    entry, module: moduleLabel(entry.log_name), description: auditTitle(entry.presentation),
    summary: entry.presentation.summary, actor: actorLabel(entry.actor), actorLink: auditUserLink(entry.actor),
    subject: entry.presentation.subject.label, source: sourceLabel(entry.source), unit: unitLabel(entry.presentation),
  })));
  readonly scopeLabel = computed(() => {
    const id = this.applied().up_id;
    return id ? this.options()?.production_units.find((unit) => Number(unit.value) === id)?.label ?? 'Unidad productiva sin nombre disponible' : 'Todo el sistema · Incluye acciones sin UP';
  });
  readonly filters = new FormGroup({
    from: new FormControl('', { nonNullable: true }), to: new FormControl('', { nonNullable: true }),
    event: new FormControl('', { nonNullable: true }), source: new FormControl('', { nonNullable: true }),
    actor: new FormControl('', { nonNullable: true }), up_id: new FormControl('', { nonNullable: true }),
  });
  readonly moduleLabel = moduleLabel;
  readonly actorLabel = actorLabel;
  readonly sourceLabel = sourceLabel;
  readonly auditTitle = auditTitle;
  readonly entryUnit = unitLabel;
  readonly supportedAction = supportedAction;
  readonly dateError = signal(false);

  constructor() {
    addIcons({ barChartOutline, businessOutline, carOutline, chevronForwardOutline, clipboardOutline, closeOutline, cubeOutline, documentsOutline, eggOutline, funnelOutline, layersOutline, peopleOutline, refreshOutline, shieldCheckmarkOutline, timeOutline });
    this.searches.pipe(debounceTime(250), takeUntilDestroyed()).subscribe(({ search, context }) => {
      if (context === this.previousContext && this.auth.user()) void this.loadResponsibles(search);
    });
    this.filters.controls.actor.valueChanges.pipe(takeUntilDestroyed()).subscribe((key) => {
      const actor = this.actorCache.get(key);
      this.responsibleLabel.set(actor ? actorLabel({ ...actor, id: actor.value }) : null);
    });
    effect(() => {
      const context = JSON.stringify([this.auth.user(), this.auth.session?.(), this.auth.status?.()]);
      const module = this.activeModule().id;
      untracked(() => {
        if (context !== this.previousContext) {
          this.previousContext = context;
          this.invalidateSession();
          if (this.auth.user()) { void this.loadOptions(); void this.loadResponsibles(''); }
        }
        if (this.auth.user()) void this.load(1, module);
        else { this.entries.set([]); this.meta.set(null); this.state.set('forbidden'); }
      });
    });
    this.destroyRef.onDestroy(() => { this.loadVersion++; this.optionsVersion++; this.directoryVersion++; this.detailVersion++; this.actionVersion++; });
  }
  private invalidateSession(): void {
    this.loadVersion++; this.optionsVersion++; this.directoryVersion++; this.actionVersion++;
    this.closeDetail(); this.reversalDialog?.invalidate(); this.feedCorrection?.invalidate();
    this.filterDialog?.close(); this.actorCache.clear(); this.appliedActor = null;
    this.applied.set({}); this.filters.reset(); this.responsibleResults.set([]);
    this.responsibleLabel.set(null); this.options.set(null); this.success.set('');
  }
  searchResponsibles(search: string): void {
    this.directoryVersion++; this.directorySearch.set(search.slice(0, 100));
    this.directoryState.set('loading'); this.searches.next({ search: this.directorySearch(), context: this.previousContext });
  }
  async loadResponsibles(search = this.directorySearch(), page = 1): Promise<void> {
    if (!this.auth.user()) return;
    const version = ++this.directoryVersion;
    this.directorySearch.set(search); this.directoryState.set('loading');
    if (page === 1) this.responsibleResults.set([]);
    try {
      const response = await firstValueFrom(this.api.responsibles(search, page).pipe(takeUntilDestroyed(this.destroyRef)));
      if (version !== this.directoryVersion) return;
      for (const actor of response.data) this.actorCache.set(actorKey(actor), actor);
      const choices = page === 1 ? response.data : [...this.responsibleResults(), ...response.data];
      this.responsibleResults.set([...new Map(choices.map((actor) => [actorKey(actor), actor])).values()]);
      this.directoryPage.set(response.meta.current_page); this.directoryLastPage.set(response.meta.last_page);
      this.directoryState.set('ready');
    } catch { if (version === this.directoryVersion) this.directoryState.set('error'); }
  }
  async load(page = 1, module: string = this.activeModule().id): Promise<void> {
    const version = ++this.loadVersion;
    this.state.set('loading'); this.error.set(''); this.entries.set([]); this.meta.set(null);
    try {
      const response = await firstValueFrom(this.api.entries({ ...this.applied(), log_name: module || undefined, page, per_page: 25 }).pipe(takeUntilDestroyed(this.destroyRef)));
      if (version !== this.loadVersion) return;
      this.entries.set(response.data); this.meta.set(response.meta); this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error: unknown) {
      if (version !== this.loadVersion) return;
      this.state.set(error instanceof HttpErrorResponse && [401, 403].includes(error.status) ? 'forbidden' : 'error');
      this.error.set(error instanceof HttpErrorResponse && error.status === 0 ? 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.' : 'No se pudo cargar el historial. Intenta de nuevo.');
    }
  }
  async loadOptions(): Promise<void> {
    const version = ++this.optionsVersion;
    this.optionsError.set(false); this.optionsLoading.set(true);
    try { const response = await firstValueFrom(this.api.options().pipe(takeUntilDestroyed(this.destroyRef))); if (version === this.optionsVersion) this.options.set(response.data); }
    catch { if (version === this.optionsVersion) this.optionsError.set(true); }
    finally { if (version === this.optionsVersion) this.optionsLoading.set(false); }
  }
  openFilters(trigger: HTMLElement): void {
    const values = this.applied();
    this.filters.reset({ from: values.from ?? '', to: values.to ?? '', event: values.event ?? '', source: values.source ?? '', actor: this.appliedActor ? actorKey(this.appliedActor) : '', up_id: values.up_id?.toString() ?? '' });
    this.dateError.set(false); this.filterDialog.open(trigger);
  }
  clearDraft(): void { this.filters.reset(); this.dateError.set(false); }
  applyFilters(): void {
    this.filters.markAllAsTouched(); const values = this.filters.getRawValue();
    this.dateError.set(Boolean(values.from && values.to && values.from > values.to));
    const actor = this.actorCache.get(values.actor) ?? null;
    this.filters.controls.actor.setErrors(values.actor && !actor ? { unavailable: true } : null);
    if (this.filters.invalid || this.dateError()) return;
    this.appliedActor = actor;
    this.applied.set({ from: values.from || undefined, to: values.to || undefined, event: values.event || undefined, source: values.source || undefined, ...actorFilters(actor), up_id: values.up_id ? Number(values.up_id) : undefined });
    this.filterDialog.close(); void this.load();
  }
  resetFilters(): void { this.appliedActor = null; this.applied.set({}); void this.load(); }
  openDetail(entry: AuditEntry, trigger: HTMLElement): void {
    this.actionVersion++; this.actionLoading.set(false);
    this.reversalDialog.invalidate(); this.feedCorrection.invalidate(); this.mortalityUndo.invalidate();
    this.selectedEntry.set(entry); this.detailTrigger = trigger; this.actionError.set('');
    this.detailDialog.nativeElement.showModal(); this.detailDialog.nativeElement.scrollTop = 0;
    this.detailHeading.nativeElement.focus({ preventScroll: true }); void this.loadDetail();
  }
  async loadDetail(): Promise<AuditDetail | null> {
    const entry = this.selectedEntry(); if (!entry) return null;
    const version = ++this.detailVersion;
    this.detail.set(null); this.detailState.set('loading'); this.detailError.set('');
    try {
      const response = await firstValueFrom(this.api.detail(entry.id).pipe(takeUntilDestroyed(this.destroyRef)));
      if (version !== this.detailVersion) return null;
      this.detail.set(response.data); this.detailState.set('ready'); return response.data;
    } catch (error) {
      if (version !== this.detailVersion) return null;
      this.detailState.set('error');
      this.detailError.set(error instanceof HttpErrorResponse && [401, 403].includes(error.status) ? 'Ya no tienes permiso para consultar este detalle.' : error instanceof HttpErrorResponse && error.status === 404 ? 'Este registro ya no está disponible.' : 'No se pudo consultar el detalle. Intenta de nuevo.');
      return null;
    }
  }
  async runAction(action: AuditAction, trigger: HTMLElement): Promise<void> {
    if (this.actionLoading() || !action.available || !supportedAction(action)) return;
    const version = ++this.actionVersion;
    this.actionLoading.set(true); this.actionError.set('');
    try {
      const fresh = await this.loadDetail();
      if (version !== this.actionVersion || !fresh) return;
      const current = fresh.presentation.actions.find((candidate) => sameAction(candidate, action));
      if (!current?.available || !supportedAction(current)) {
        this.actionError.set(current?.reason || fresh.presentation.reversibility.reason); return;
      }
      if (current.kind === 'undo_mortality' && typeof current.target.id === 'string') {
        await this.mortalityUndo.open(current.target.flock_id!, current.target.id, this.detailHeading.nativeElement);
      } else if (current.kind === 'reverse_inventory_movement' && typeof current.target.id === 'number') {
        const response = await firstValueFrom(this.inventory.movement(current.target.id).pipe(takeUntilDestroyed(this.destroyRef)));
        if (version === this.actionVersion) this.reversalDialog.open(response.data, current.label, trigger.isConnected ? trigger : this.detailHeading.nativeElement);
      } else if (current.kind === 'correct_feed_consumption' && typeof current.target.id === 'number') {
        // Ionic's editor must be above the page; a native modal dialog would make it inert.
        this.detailDialog.nativeElement.close();
        await this.feedCorrection.open(current.target.flock_id!, current.target.id, this.detailHeading.nativeElement);
        if (version === this.actionVersion && !this.feedCorrection.isOpen()) this.resumeDetail();
      }
    } catch {
      if (version === this.actionVersion) {
        this.actionError.set('No se pudo abrir la operación. Intenta de nuevo.'); this.resumeDetail();
      }
    } finally { if (version === this.actionVersion) this.actionLoading.set(false); }
  }
  resumeDetail(): void {
    if (this.selectedEntry() && !this.detailDialog.nativeElement.open) {
      this.detailDialog.nativeElement.showModal(); this.detailHeading.nativeElement.focus({ preventScroll: true });
    }
  }
  onCorrected(): void {
    this.success.set('Corrección registrada. Se conserva el historial original.');
    this.resumeDetail(); void this.loadDetail(); void this.load(this.meta()?.current_page ?? 1);
  }
  onCommandFailed(status: number): void {
    if ([401, 403, 404, 409].includes(status)) { void this.loadDetail(); void this.load(this.meta()?.current_page ?? 1); }
    if (status === 403) void this.auth.refreshIdentity();
  }
  closeDetail(event?: Event): void {
    event?.preventDefault(); this.detailVersion++; this.actionVersion++; this.actionLoading.set(false);
    this.mortalityUndo?.invalidate();
    this.detailDialog?.nativeElement.close(); this.selectedEntry.set(null); this.detail.set(null); this.detailState.set('idle');
    if (this.detailTrigger?.isConnected) this.detailTrigger.focus({ preventScroll: true }); this.detailTrigger = null;
  }
}
