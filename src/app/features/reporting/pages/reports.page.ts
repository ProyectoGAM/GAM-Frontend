import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, arrowForwardOutline, barChartOutline, basketOutline, bookmarksOutline, calendarOutline, carOutline, checkmarkOutline, clipboardOutline, closeOutline, copyOutline, createOutline, cubeOutline, documentTextOutline, downloadOutline, eggOutline, enterOutline, heartOutline, layersOutline, listOutline, medicalOutline, nutritionOutline, optionsOutline, refreshOutline, scaleOutline, searchOutline, shareSocialOutline, swapHorizontalOutline, timeOutline, trashOutline } from 'ionicons/icons';
import { EMPTY, Subject, Subscription, catchError, combineLatest, debounceTime, finalize, firstValueFrom, map, switchMap, takeUntil, timer } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../admin/services/admin-unit-context.service';
import { ReportTableComponent } from '../components/report-table.component';
import { ReportExport, ReportOptions, ReportPreset, ReportQuery, ReportResult, ReportSource, ReportTemporaryLink } from '../interfaces/report';
import { queryFromForm } from '../services/report-query';
import { ReportingService } from '../services/reporting.service';
import { ReportFieldPickerComponent } from '../components/report-field-picker.component';
import { reportHelp, reportIcons, reportTopics } from '../services/report-presentation';
import { ReportHelpComponent } from '../components/report-help.component';
import { ReportShareDialogComponent } from '../components/report-share-dialog.component';
import { reportFieldHelp, reportHelpText, reportOptionLabel } from '../services/report-help';

type FilterForm = FormGroup<{ field: FormControl<string>; operator: FormControl<string>; value: FormControl<string> }>;

@Component({
  selector: 'app-reports', imports: [ReactiveFormsModule, IonIcon, IonSpinner, ReportTableComponent, RouterLink, DatePipe, NgTemplateOutlet, ReportFieldPickerComponent, ReportHelpComponent, ReportShareDialogComponent],
  templateUrl: './reports.page.html', styleUrl: './reports.page.scss',
})
export class ReportsPage {
  private readonly api = inject(ReportingService);
  private readonly auth = inject(AuthStore);
  readonly unitContext = inject(AdminUnitContextService, { optional: true });
  readonly dashboardReady = computed(() => !this.unitContext || this.unitContext.state() === 'ready');
  readonly dashboardUnitLabel = computed(() => {
    if (!this.dashboardReady()) return 'Esperando la selección del dashboard…';
    return this.unitContext?.selectedUnit()?.name ?? 'Todas las unidades productivas';
  });
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly navigationDraft = inject(Router).currentNavigation()?.extras.state as { actorId?: number; sourceKey?: string; configuration?: ReportQuery } | undefined;
  readonly actorId = computed(() => this.auth.user()?.id ?? null);
  readonly reportPath = '/administracion/reportes/reportes';
  readonly screen = this.route.snapshot.data['screen'] as 'home' | 'topic' | 'saved' | 'files' | 'create' | 'view' ?? 'home';
  readonly topicKey = signal(this.route.snapshot.paramMap.get('topic'));
  readonly topics = computed(() => reportTopics.filter(topic => this.sources().some(source => topic.sources.includes(source.key))));
  readonly topic = computed(() => this.topics().find(topic => topic.key === this.topicKey()));
  readonly topicSources = computed(() => this.sources().filter(source => this.topic()?.sources.includes(source.key)));
  readonly creationTopic = signal<string | null>(null);
  readonly creationSources = computed(() => this.sources().filter(source => reportTopics.find(topic => topic.key === this.creationTopic())?.sources.includes(source.key)));
  readonly help = reportHelp;
  readonly reportIcons = reportIcons;
  readonly helpText = reportHelpText;
  readonly step = signal(1);
  readonly reportMode = signal<'detail' | 'summary'>('detail');
  readonly showSave = signal(false);
  readonly deleteCandidate = signal<ReportPreset | null>(null);
  readonly selectedStandard = signal<number | null>(null);
  readonly activeExport = computed(() => this.exports().find(item => item.source_key === this.source()?.key) ?? null);
  readonly pageTitle = computed(() => ({ home: 'Reportes', topic: this.topic()?.label ?? 'Reportes', saved: 'Mis reportes guardados', files: 'Reportes exportados', create: 'Crear un reporte', view: this.source()?.label ?? 'Consultar reporte' })[this.screen]);
  private readonly requests = new Subject<{ source: ReportSource; query: ReportQuery; advance?: boolean }>();
  private readonly cancelRequests = new Subject<void>();
  private polling = new Map<number, Subscription>();
  private requestKeys = new Map<string, string>();
  private sharedTimer: ReturnType<typeof setTimeout> | null = null;
  private shareGeneration = 0;
  private identity: number | null = null;
  private epoch = 0;
  private sourceGeneration = 0;
  private contextGeneration = 0;
  private lastDashboardUnit: number | null | undefined;
  private awaitingDashboardQuery = false;
  private optionSearchTerms = new Map<string, string>();
  private optionRequests = new Map<string, number>();
  readonly sources = signal<ReportSource[]>([]);
  readonly source = signal<ReportSource | null>(null);
  readonly result = signal<ReportResult | null>(null);
  readonly appliedQuery = signal<ReportQuery | null>(null);
  readonly presets = signal<ReportPreset[]>([]);
  readonly presetPage = signal(1);
  readonly presetLastPage = signal(1);
  readonly selectedPreset = signal<ReportPreset | null>(null);
  readonly exports = signal<ReportExport[]>([]);
  readonly exportPage = signal(1);
  readonly exportLastPage = signal(1);
  readonly options = signal<Partial<Record<string, ReportOptions>>>({});
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly busy = signal(false);
  readonly actionBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly pendingChanges = signal(false);
  readonly sharedLink = signal<ReportTemporaryLink | null>(null);
  readonly shareTrigger = signal<HTMLElement | null>(null);
  readonly sharedExport = signal<ReportExport | null>(null);
  readonly shareDuration = signal(30);
  readonly linkBusy = signal(false);
  readonly linkActionBusy = signal(false);
  readonly linkSharingAvailable = computed(() => this.sharedLink() !== null && this.api.canShareLink());
  readonly presetName = new FormControl('', { nonNullable: true });
  readonly filters = new FormArray<FilterForm>([]);
  readonly form = new FormGroup({
    columns: new FormControl<string[]>([], { nonNullable: true }), groupings: new FormControl<string[]>([], { nonNullable: true }),
    metrics: new FormControl<string[]>([], { nonNullable: true }), from: new FormControl('', { nonNullable: true }), to: new FormControl('', { nonNullable: true }),
    sort: new FormControl('', { nonNullable: true }), direction: new FormControl<'asc' | 'desc'>('desc', { nonNullable: true }), filters: this.filters,
  });
  readonly columns = computed(() => Object.entries(this.source()?.columns ?? {}).filter(([key]) => !key.endsWith('_id') || !(key.slice(0, -3) in (this.source()?.columns ?? {}))).map(([key, value]) => ({ key, ...value })));
  readonly groupings = computed(() => Object.entries(this.source()?.groupings ?? {}).map(([key, value]) => ({ key, ...value })));
  readonly metrics = computed(() => Object.entries(this.source()?.metrics ?? {}).map(([key, value]) => ({ key, ...value })));
  readonly filterDefinitions = computed(() => Object.entries(this.source()?.filters ?? {}).map(([key, value]) => ({ key, ...value })));
  readonly filterHelp = computed(() => Object.fromEntries(this.filterDefinitions().map(field => [field.key, reportFieldHelp(this.source()?.key ?? '', field.key)])));
  readonly sortOptions = signal<{ key: string; label: string }[]>([]);
  readonly selectedLabels = signal<string[]>([]);
  readonly hasBasicFilters = signal(false);
  readonly basicFilters = computed(() => this.filterDefinitions().map((definition, index) => ({ ...definition, index })).filter(definition => ['production_unit_id', 'poultry_house_id', 'flock_id'].includes(definition.key)));
  readonly extraFilters = computed(() => this.filterDefinitions().map((definition, index) => ({ ...definition, index })).filter(definition => !['production_unit_id', 'poultry_house_id', 'flock_id'].includes(definition.key)));

  constructor() {
    addIcons({
      'add-outline': addOutline, 'arrow-back-outline': arrowBackOutline, 'arrow-forward-outline': arrowForwardOutline,
      'bar-chart-outline': barChartOutline, 'basket-outline': basketOutline, 'bookmarks-outline': bookmarksOutline,
      'calendar-outline': calendarOutline, 'car-outline': carOutline, 'checkmark-outline': checkmarkOutline,
      'clipboard-outline': clipboardOutline, 'close-outline': closeOutline, 'copy-outline': copyOutline,
      'create-outline': createOutline, 'cube-outline': cubeOutline, 'document-text-outline': documentTextOutline,
      'download-outline': downloadOutline, 'egg-outline': eggOutline, 'enter-outline': enterOutline,
      'heart-outline': heartOutline, 'layers-outline': layersOutline, 'list-outline': listOutline,
      'medical-outline': medicalOutline, 'nutrition-outline': nutritionOutline, 'options-outline': optionsOutline,
      'refresh-outline': refreshOutline, 'scale-outline': scaleOutline, 'search-outline': searchOutline,
      'share-social-outline': shareSocialOutline, 'swap-horizontal-outline': swapHorizontalOutline,
      'time-outline': timeOutline, 'trash-outline': trashOutline,
    });
    this.requests.pipe(switchMap(({ source, query, advance = true }) => {
      const unitId = source.filters['production_unit_id'] ? this.unitContext?.selectedId() : undefined;
      this.busy.set(true); this.error.set(null);
      return this.api.preview(source.key, query).pipe(takeUntil(this.cancelRequests),
        map((response) => ({ result: response.data, query, unitId, advance })),
        catchError((error: unknown) => { this.error.set(this.message(error)); return EMPTY; }),
        finalize(() => this.busy.set(false)));
    }), takeUntilDestroyed()).subscribe((response) => {
      if (response.unitId !== undefined && (!this.dashboardReady() || response.unitId !== this.unitContext?.selectedId())) return;
      this.result.set(response.result); this.appliedQuery.set(response.query);
      if (this.screen === 'create' && response.advance) this.goToStep(4);
      const source = this.source();
      if (source) {
        try { this.pendingChanges.set(JSON.stringify({ ...queryFromForm(source, this.form.getRawValue()), page: 1 }) !== JSON.stringify({ ...response.query, page: 1 })); }
        catch { this.pendingChanges.set(true); }
      }
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { this.pendingChanges.set(true); this.updateSortOptions(); });
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      if (id === this.identity) return;
      this.identity = id; this.clearPrivateState();
      if (id !== null) void this.load();
    });
    if (this.unitContext) {
      effect(() => {
        const unitId = this.unitContext!.selectedId(); const ready = this.dashboardReady(); const source = this.source();
        if (!source?.filters['production_unit_id']) return;
        untracked(() => {
          if (!ready) {
            this.awaitingDashboardQuery ||= Boolean(this.result()) || this.busy();
            this.cancelRequests.next(); this.result.set(null); this.appliedQuery.set(null); this.clearLink();
            return;
          }
          const changed = this.lastDashboardUnit !== undefined && this.lastDashboardUnit !== unitId;
          this.lastDashboardUnit = unitId;
          const previous = this.appliedQuery();
          const querying = this.busy();
          const advance = this.screen !== 'create' || this.step() === 4 || (this.step() === 3 && (querying || this.awaitingDashboardQuery));
          this.syncDashboardUnit(changed);
          if (changed) {
            this.contextGeneration++; this.cancelRequests.next(); this.clearLink(); this.exports.set([]);
            this.result.set(null); this.appliedQuery.set(null); this.pendingChanges.set(true);
          }
          if (this.awaitingDashboardQuery || (changed && (previous || querying || this.screen === 'view'))) {
            this.awaitingDashboardQuery = false;
            if (previous && changed) this.requests.next({ source, query: this.queryForDashboard(previous, true), advance });
            else this.query(1, advance);
          }
        });
      });
    }
    this.destroyRef.onDestroy(() => this.clearPrivateState());
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', this.visibilityChanged));
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(debounceTime(0), takeUntilDestroyed()).subscribe(() => {
      this.topicKey.set(this.route.snapshot.paramMap.get('topic'));
      if (this.state() === 'ready' && ['view', 'create'].includes(this.screen)) void this.openRouteReport();
    });
  }

  private readonly visibilityChanged = (): void => {
    if (document.hidden) this.stopPolling();
    else for (const item of this.exports()) this.watch(item);
  };

  async load(): Promise<void> {
    const epoch = this.epoch;
    this.state.set('loading'); this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.sources());
      if (epoch !== this.epoch) return;
      this.sources.set(response.data); this.state.set('ready');
      if (['view', 'create'].includes(this.screen)) await this.openRouteReport();
      if (this.screen === 'saved') await this.loadPresets();
      if (this.screen === 'files') await this.loadExports();
    } catch (error) { if (epoch === this.epoch) { this.error.set(this.message(error)); this.state.set('error'); } }
  }

  selectSource(key: string): void {
    this.sourceGeneration++; this.optionSearchTerms.clear(); this.optionRequests.clear();
    this.selectedStandard.set(null); this.showSave.set(false); this.reportMode.set('detail');
    this.cancelRequests.next(); this.clearLink(); this.selectedPreset.set(null); this.presetName.setValue('');
    const source = this.sources().find((item) => item.key === key) ?? null;
    this.creationTopic.set(reportTopics.find(topic => topic.sources.includes(key))?.key ?? null);
    this.source.set(source); this.result.set(null); this.appliedQuery.set(null); this.options.set({}); this.error.set(null);
    this.filters.clear({ emitEvent: false });
    if (!source) return;
    this.form.reset({ columns: source.default_columns, groupings: [], metrics: [], from: '', to: '', sort: source.default_sort.split(':')[0], direction: source.default_sort.endsWith(':asc') ? 'asc' : 'desc' }, { emitEvent: false });
    for (const [field, definition] of Object.entries(source.filters)) {
      this.filters.push(new FormGroup({ field: new FormControl(field, { nonNullable: true }), operator: new FormControl(definition.operators[0], { nonNullable: true }), value: new FormControl('', { nonNullable: true }) }), { emitEvent: false });
      if (!(this.unitContext && field === 'production_unit_id') && (definition.options_source || definition.options || definition.type === 'boolean')) void this.loadOptions(field);
    }
    this.syncDashboardUnit();
    this.pendingChanges.set(false); this.updateSortOptions();
  }

  async loadOptions(field: string, search = '', page = 1): Promise<void> {
    const source = this.source(); const epoch = this.epoch; const generation = this.sourceGeneration;
    if (!source) return;
    search = page > 1 ? this.optionSearchTerms.get(field) ?? search : search;
    this.optionSearchTerms.set(field, search);
    const request = (this.optionRequests.get(field) ?? 0) + 1; this.optionRequests.set(field, request);
    try {
      const response = await firstValueFrom(this.api.options(source.key, field, search, page));
      if (epoch !== this.epoch || this.source()?.key !== source.key || generation !== this.sourceGeneration || request !== this.optionRequests.get(field)) return;
      const data = response.data.map(option => ({ ...option, label: reportOptionLabel(source.key, field, option.value, option.label) }));
      this.options.update((value) => ({ ...value, [field]: { ...response, data: page > 1 ? [...(value[field]?.data ?? []), ...data] : data } }));
    } catch (error) { if (epoch === this.epoch && this.source()?.key === source.key) this.error.set(this.message(error)); }
  }

  private async openRouteReport(): Promise<void> {
    const key = this.route.snapshot.paramMap.get('sourceKey') ?? this.route.snapshot.queryParamMap.get('source');
    if (!key) return;
    if (!this.sources().some(source => source.key === key)) { this.error.set('Este reporte no está disponible para tu usuario.'); return; }
    this.selectSource(key);
    const generation = this.sourceGeneration; const epoch = this.epoch;
    const presetId = this.route.snapshot.queryParamMap.get('guardado');
    if (presetId) {
      if (!/^\d+$/.test(presetId)) { this.error.set('El reporte guardado no es válido.'); return; }
      try {
        const response = await firstValueFrom(this.api.preset(Number(presetId)));
        if (generation !== this.sourceGeneration || epoch !== this.epoch) return;
        if (response.data.source_key !== key) { this.error.set('El reporte guardado corresponde a otro tema.'); return; }
        this.applyPreset(response.data, this.screen === 'view');
        if (this.screen === 'create') this.goToStep(2);
      } catch (error) { if (generation === this.sourceGeneration && epoch === this.epoch) this.error.set(this.message(error)); }
      return;
    }
    if (this.screen === 'view') {
      if (this.source()?.standard_queries.length) this.standard(0);
      else this.query();
    } else if (this.screen === 'create') {
      if (this.navigationDraft?.actorId === this.actorId() && this.navigationDraft?.sourceKey === key && this.navigationDraft?.configuration) this.restore(this.navigationDraft.configuration);
      this.goToStep(2);
    }
  }

  chooseSource(key: string): void { if (this.source()?.key !== key) this.selectSource(key); this.goToStep(2); }

  goToStep(step: number): void {
    this.step.set(step);
    requestAnimationFrame(() => {
      const heading = document.getElementById('wizard-step-title');
      heading?.focus({ preventScroll: true });
      void heading?.closest<HTMLIonContentElement>('ion-content')?.scrollToTop(0);
    });
  }

  setMode(mode: 'detail' | 'summary'): void {
    this.reportMode.set(mode);
    this.form.patchValue({ columns: this.form.controls.columns.value.length ? this.form.controls.columns.value : this.source()?.default_columns ?? [], groupings: [], metrics: mode === 'summary' ? Object.keys(this.source()?.metrics ?? {}).slice(0, 1) : [] });
  }

  nextStep(): void {
    this.error.set(null);
    if (this.step() === 2) {
      if (this.reportMode() === 'detail' && !this.form.controls.columns.value.length) { this.error.set('Marca al menos un dato para tu reporte.'); return; }
      if (this.reportMode() === 'summary' && !this.form.controls.metrics.value.length) { this.error.set('Marca al menos un total o promedio para tu reporte.'); return; }
      this.goToStep(3);
    }
  }

  setPeriod(period: 'all' | 'month' | 'custom'): void {
    if (period === 'all') this.form.patchValue({ from: '', to: '' });
    if (period === 'month') {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      this.form.patchValue({ from: today.slice(0, 7) + '-01', to: today });
    }
  }

  reportLabel(key: string): string { return this.sources().find(source => source.key === key)?.label ?? 'Reporte'; }

  filterContains(index: number, value: string | number | boolean): boolean { return this.filters.at(index).controls.value.value.split(',').includes(String(value)); }
  toggleFilterOption(index: number, value: string | number | boolean): void {
    const control = this.filters.at(index).controls.value; const items = control.value.split(',').filter(Boolean); const item = String(value);
    control.setValue(items.includes(item) ? items.filter(value => value !== item).join(',') : [...items, item].join(','));
  }
  hasSavedOption(field: string, index: number): boolean { const value = this.filters.at(index).controls.value.value; return Boolean(value) && !(this.options()[field]?.data ?? []).some(option => String(option.value) === value); }
  dismissShare(): void { this.clearLink(); }

  async removeSaved(preset: ReportPreset): Promise<void> {
    this.selectedPreset.set(preset); await this.deletePreset(); this.deleteCandidate.set(null);
  }

  query(page = 1, advance = true): void {
    const source = this.source(); if (!source) return;
    if (source.filters['production_unit_id'] && !this.dashboardReady()) { this.awaitingDashboardQuery = true; return; }
    this.syncDashboardUnit();
    try {
      const query = page === 1 ? queryFromForm(source, this.form.getRawValue()) : { ...this.appliedQuery(), page };
      this.requests.next({ source, query, advance });
    } catch (error) { this.error.set(this.message(error)); }
  }

  sort(key: string): void {
    this.form.controls.direction.setValue(this.form.controls.sort.value === key && this.form.controls.direction.value === 'asc' ? 'desc' : 'asc');
    this.form.controls.sort.setValue(key); this.query();
  }

  standard(index: number): void {
    const source = this.source(); const configuration = source?.standard_queries[index]?.configuration;
    if (!source || !configuration) return;
    this.selectedStandard.set(index); this.restore(configuration); this.query();
  }

  private restore(query: ReportQuery): void {
    this.reportMode.set(query.groupings?.length || query.metrics?.length ? 'summary' : 'detail');
    this.form.patchValue({ columns: query.columns ?? this.source()?.default_columns ?? [], groupings: query.groupings ?? [], metrics: query.metrics ?? [], from: query.from ?? '', to: query.to ?? '', sort: query.sorts?.[0]?.field ?? '', direction: query.sorts?.[0]?.direction ?? 'asc' });
    for (const group of this.filters.controls) {
      const filter = query.filters?.find((item) => item.field === group.controls.field.value);
      group.patchValue({ operator: filter?.operator ?? this.source()?.filters[group.controls.field.value].operators[0] ?? 'eq', value: filter ? (Array.isArray(filter.value) ? filter.value.join(',') : String(filter.value)) : '' });
    }
    this.syncDashboardUnit();
    this.updateSortOptions();
  }

  private syncDashboardUnit(clearDependent = false): void {
    if (!this.unitContext) return;
    const filter = this.filters.controls.find(group => group.controls.field.value === 'production_unit_id');
    if (!filter) return;
    const unitId = this.unitContext.selectedId(); const value = unitId === null ? '' : String(unitId);
    const incompatible = unitId !== null && filter.controls.value.value !== '' && (filter.controls.operator.value !== 'eq' || filter.controls.value.value !== value);
    if (clearDependent || incompatible) {
      for (const group of this.filters.controls) {
        if (['poultry_house_id', 'flock_id'].includes(group.controls.field.value)) group.patchValue({ value: '', operator: 'eq' }, { emitEvent: false });
      }
    }
    filter.patchValue({ operator: 'eq', value }, { emitEvent: false });
    filter.disable({ emitEvent: false });
    this.updateSortOptions();
  }

  private queryForDashboard(query: ReportQuery, clearDependent = false): ReportQuery {
    if (!this.unitContext || !this.source()?.filters['production_unit_id']) return query;
    const filters = (query.filters ?? []).filter(filter => filter.field !== 'production_unit_id' && (!clearDependent || !['poultry_house_id', 'flock_id'].includes(filter.field)));
    const unitId = this.unitContext.selectedId();
    if (unitId !== null) filters.push({ field: 'production_unit_id', operator: 'eq', value: unitId });
    const order = Object.keys(this.source()?.filters ?? {});
    filters.sort((left, right) => order.indexOf(left.field) - order.indexOf(right.field));
    return { ...query, filters, page: 1 };
  }

  private matchesDashboard(query: ReportQuery): boolean {
    if (!this.unitContext || !this.source()?.filters['production_unit_id']) return true;
    const filters = (query.filters ?? []).filter(filter => filter.field === 'production_unit_id');
    const unitId = this.unitContext.selectedId();
    return this.dashboardReady() && (unitId === null ? filters.length === 0 : filters.length === 1 && filters[0].operator === 'eq' && filters[0].value === unitId);
  }

  private updateSortOptions(): void {
    const source = this.source(); if (!source) return;
    const selected = [...this.form.controls.groupings.value, ...this.form.controls.metrics.value];
    const keys = selected.length ? selected : Object.keys(source.sorts);
    this.sortOptions.set(keys.filter((key) => key in source.sorts).map((key) => ({ key, label: source.sorts[key].label })));
    const fields = selected.length ? selected : this.form.controls.columns.value;
    this.selectedLabels.set(fields.map(key => source.columns[key]?.label ?? source.groupings[key]?.label ?? source.metrics[key]?.label ?? key));
    this.hasBasicFilters.set(this.basicFilters().some(definition => Boolean(this.filters.at(definition.index)?.controls.value.value.trim())));
  }

  async loadPresets(page = 1): Promise<void> {
    if (!this.sources().some((source) => source.capabilities.presets)) return;
    const epoch = this.epoch;
    try {
      const result = await firstValueFrom(this.api.presets(page));
      if (epoch !== this.epoch) return;
      this.presets.set(result.data); this.presetPage.set(result.meta.current_page); this.presetLastPage.set(result.meta.last_page);
    } catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
  }

  applyPreset(preset: ReportPreset, run = true): void {
    const source = this.sources().find((item) => item.key === preset.source_key);
    if (!source) { this.error.set('Esta configuración requiere una fuente que no tienes disponible.'); return; }
    if (source.definition_version !== preset.definition_version) { this.error.set('La configuración usa otra versión del reporte. Crea una configuración con las opciones actuales.'); return; }
    this.selectSource(source.key); this.restore(preset.configuration); this.selectedPreset.set(preset); this.presetName.setValue(preset.name); if (run) this.query();
  }

  async savePreset(update = false): Promise<void> {
    const source = this.source(); const name = this.presetName.value.trim(); const epoch = this.epoch; const contextGeneration = this.contextGeneration;
    if (!source || !name) { this.error.set('Indica un nombre para la configuración.'); return; }
    if (source.filters['production_unit_id'] && !this.dashboardReady()) return;
    this.actionBusy.set(true); this.error.set(null);
    try {
      this.syncDashboardUnit();
      const query = queryFromForm(source, this.form.getRawValue()); const preset = this.selectedPreset();
      const response = await firstValueFrom(update && preset ? this.api.updatePreset(preset.id, name, query) : this.api.createPreset(name, source.key, query));
      if (epoch !== this.epoch || contextGeneration !== this.contextGeneration) return;
      this.selectedPreset.set(response.data); this.notice.set('Reporte guardado. Lo encontrarás en Mis reportes guardados.'); this.showSave.set(false);
    } catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
    finally { if (epoch === this.epoch) this.actionBusy.set(false); }
  }

  async deletePreset(): Promise<void> {
    const preset = this.selectedPreset(); const epoch = this.epoch; if (!preset) return;
    this.actionBusy.set(true);
    try { await firstValueFrom(this.api.deletePreset(preset.id)); if (epoch !== this.epoch) return; this.selectedPreset.set(null); this.presetName.setValue(''); await this.loadPresets(); }
    catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
    finally { if (epoch === this.epoch) this.actionBusy.set(false); }
  }

  async export(format: 'xlsx' | 'pdf'): Promise<void> {
    const source = this.source(); const query = this.appliedQuery(); const epoch = this.epoch; const contextGeneration = this.contextGeneration;
    if (!source || !query || !this.result() || this.pendingChanges()) return;
    if (!this.matchesDashboard(query)) return;
    this.actionBusy.set(true); this.error.set(null);
    const fingerprint = JSON.stringify([source.key, query, format]);
    const key = this.requestKeys.get(fingerprint) ?? crypto.randomUUID(); this.requestKeys.set(fingerprint, key);
    try {
      const response = await firstValueFrom(this.api.requestExport(source.key, query, format, key));
      if (epoch !== this.epoch || contextGeneration !== this.contextGeneration) return;
      this.requestKeys.delete(fingerprint); this.exports.update((items) => [response.data, ...items.filter((item) => item.id !== response.data.id)]); this.watch(response.data);
      this.notice.set('Estamos preparando tu archivo. Aquí aparecerá el botón para descargarlo.');
    } catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
    finally { if (epoch === this.epoch) this.actionBusy.set(false); }
  }

  async loadExports(page = 1): Promise<void> {
    const epoch = this.epoch;
    try { const response = await firstValueFrom(this.api.exports(page)); if (epoch !== this.epoch) return; this.stopPolling(); this.exports.set(response.data); this.exportPage.set(response.meta.current_page); this.exportLastPage.set(response.meta.last_page); for (const item of response.data) this.watch(item); }
    catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
  }

  private watch(item: ReportExport): void {
    if (document.hidden || !['pending', 'processing'].includes(item.status) || this.polling.has(item.id)) return;
    const subscription = this.api.watchExport(item.id).pipe(takeUntil(timer(300000)), takeUntilDestroyed(this.destroyRef), finalize(() => this.polling.delete(item.id)))
      .subscribe({ next: (response) => this.exports.update((items) => items.map((entry) => entry.id === item.id ? response.data : entry)), error: (error: unknown) => this.error.set(this.message(error)) });
    this.polling.set(item.id, subscription);
  }

  async download(item: ReportExport): Promise<void> {
    this.actionBusy.set(true); this.error.set(null);
    try { await this.api.download(item); this.notice.set('Descarga completada.'); }
    catch (error) { this.error.set(this.message(error)); }
    finally { this.actionBusy.set(false); }
  }

  async share(item: ReportExport, event?: Event): Promise<void> {
    const trigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.clearLink(); this.sharedExport.set(item); this.shareTrigger.set(trigger);
    await this.updateShareDuration(30);
  }

  async updateShareDuration(minutes: number): Promise<void> {
    const item = this.sharedExport(); if (!item || this.linkBusy()) return;
    const epoch = this.epoch; const contextGeneration = this.contextGeneration; const generation = this.shareGeneration;
    const previousDuration = this.shareDuration();
    this.linkBusy.set(true); this.actionBusy.set(true); this.shareDuration.set(minutes); this.error.set(null); this.notice.set(null);
    try {
      const link = await firstValueFrom(this.api.temporaryLink(item.id, minutes));
      if (epoch !== this.epoch || contextGeneration !== this.contextGeneration || generation !== this.shareGeneration) return;
      if (this.sharedTimer) clearTimeout(this.sharedTimer);
      this.sharedLink.set(link);
      const fileExpiresAt = link.file_expires_at;
      if (fileExpiresAt !== undefined) this.exports.update(items => items.map(entry => entry.id === item.id ? { ...entry, expires_at: fileExpiresAt } : entry));
      this.scheduleLinkExpiry(link);
    } catch (error) {
      if (epoch === this.epoch && generation === this.shareGeneration) {
        this.shareDuration.set(previousDuration);
        this.error.set(this.message(error) + (this.sharedLink() ? ' Se mantiene el enlace anterior.' : ''));
      }
    } finally {
      if (epoch === this.epoch && generation === this.shareGeneration) { this.linkBusy.set(false); this.actionBusy.set(false); }
    }
  }

  async copyLink(): Promise<void> {
    const link = this.sharedLink(); if (!link || this.linkBusy() || this.linkActionBusy()) return;
    this.linkActionBusy.set(true); this.error.set(null); this.notice.set(null);
    try { await this.api.copyLink(link.url); if (this.sharedLink() === link) this.notice.set('Enlace copiado. Ya puedes pegarlo en un mensaje.'); }
    catch { if (this.sharedLink() === link) this.error.set('No se pudo copiar el enlace. Puedes seleccionarlo y copiarlo manualmente.'); }
    finally { if (this.sharedLink() === link) this.linkActionBusy.set(false); }
  }

  async shareLink(): Promise<void> {
    const link = this.sharedLink(); if (!link || this.linkBusy() || this.linkActionBusy()) return;
    this.linkActionBusy.set(true); this.error.set(null); this.notice.set(null);
    try { const shared = await this.api.shareLink(link.url); if (shared && this.sharedLink() === link) this.notice.set('Se completó la opción de compartir.'); }
    catch { if (this.sharedLink() === link) this.error.set('No se pudo compartir. Puedes copiar el enlace y enviarlo en un mensaje.'); }
    finally { if (this.sharedLink() === link) this.linkActionBusy.set(false); }
  }

  canShare(item: ReportExport): boolean { return this.sources().some((source) => source.key === item.source_key && source.capabilities.share); }
  sourceChanged(event: Event): void { this.selectSource((event.target as HTMLSelectElement).value); }
  optionSearch(event: Event, field: string): void { void this.loadOptions(field, (event.target as HTMLInputElement).value); }
  readonly operatorLabels: Record<string, string> = { eq: 'Incluir esta opción', neq: 'Excluir esta opción', in: 'Incluir varias opciones', not_in: 'Excluir varias opciones' };
  exportStatus(item: ReportExport): string { return ({ pending: 'En preparación', processing: 'En preparación', completed: 'Listo para descargar', failed: 'No se pudo preparar', expired: 'Ya venció' })[item.status]; }
  private scheduleLinkExpiry(link: ReportTemporaryLink): void {
    const remaining = new Date(link.expires_at).getTime() - Date.now();
    if (remaining <= 0) { this.clearLink(); return; }
    // Browser timers accept at most about 24 days; recheck longer links instead of overflowing.
    this.sharedTimer = setTimeout(() => { if (this.sharedLink() === link) this.scheduleLinkExpiry(link); }, Math.min(remaining, 2147483647));
  }
  private clearLink(): void { this.shareGeneration++; if (this.sharedTimer) clearTimeout(this.sharedTimer); this.sharedTimer = null; this.sharedLink.set(null); this.shareTrigger.set(null); this.sharedExport.set(null); this.shareDuration.set(30); if (this.linkBusy()) this.actionBusy.set(false); this.linkBusy.set(false); this.linkActionBusy.set(false); }
  private stopPolling(): void { for (const subscription of this.polling.values()) subscription.unsubscribe(); this.polling.clear(); }
  private clearPrivateState(): void { this.epoch++; this.contextGeneration++; this.lastDashboardUnit = undefined; this.awaitingDashboardQuery = false; this.cancelRequests.next(); this.stopPolling(); this.clearLink(); this.requestKeys.clear(); this.sources.set([]); this.source.set(null); this.result.set(null); this.appliedQuery.set(null); this.presets.set([]); this.exports.set([]); this.options.set({}); this.selectedPreset.set(null); this.presetName.reset(); this.filters.clear({ emitEvent: false }); this.form.reset({}, { emitEvent: false }); this.error.set(null); this.notice.set(null); this.actionBusy.set(false); this.step.set(1); this.creationTopic.set(null); this.showSave.set(false); this.deleteCandidate.set(null); this.selectedLabels.set([]); }
  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se pudo conectar. Revisa la conexión e intenta nuevamente.';
      if (error.status === 401) return 'La sesión expiró. Vuelve a iniciar sesión.';
      if (error.status === 403) return 'No tienes permiso para realizar esta operación.';
      if (error.status === 429) return 'Hay demasiadas solicitudes. Espera un momento antes de reintentar.';
      const problem = error.error as { detail?: string; message?: string; errors?: Record<string, string[]> } | null;
      return Object.values(problem?.errors ?? {}).flat().join(' ') || problem?.detail || problem?.message || 'No se pudo completar la operación.';
    }
    return error instanceof Error ? error.message : 'No se pudo completar la operación.';
  }
}
