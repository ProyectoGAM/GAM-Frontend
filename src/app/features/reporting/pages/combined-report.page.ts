import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { appsOutline, arrowBackOutline, arrowDownOutline, arrowForwardOutline, arrowUpOutline, calendarOutline, carOutline, constructOutline, cubeOutline, documentTextOutline, downloadOutline, eggOutline, gridOutline, heartOutline, peopleOutline, trashOutline } from 'ionicons/icons';
import { Subscription, finalize, of, switchMap } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../admin/services/admin-unit-context.service';
import { CombinedReportFilter, CombinedReportFilterComponent } from '../components/combined-report-filter.component';
import { ReportFieldPickerComponent } from '../components/report-field-picker.component';
import { ReportTableComponent } from '../components/report-table.component';
import { CombinedReportSection, ReportExport, ReportField, ReportQuery, ReportResult, ReportSource } from '../interfaces/report';
import { reportColumns, reportHelp, reportNames, reportTopics } from '../services/report-presentation';
import { formatReportCell, queryFromForm, reportPeriod } from '../services/report-query';
import { ReportingService } from '../services/reporting.service';

interface ReportSection {
  source: ReportSource;
  title: string;
  topic: string;
  icon: string;
  columns: string[];
  groupings: string[];
  metrics: string[];
  summary: boolean;
  filters: CombinedReportFilter[];
}

type Period = 'month' | 'previous' | 'all' | 'custom';

@Component({
  selector: 'app-combined-report',
  imports: [ReactiveFormsModule, RouterLink, IonIcon, IonSpinner, ReportFieldPickerComponent, ReportTableComponent, CombinedReportFilterComponent],
  templateUrl: './combined-report.page.html',
  styleUrl: './combined-report.page.scss',
})
export class CombinedReportPage {
  private readonly api = inject(ReportingService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  readonly unitContext = inject(AdminUnitContextService, { optional: true });
  private readonly actor = computed(() => this.auth.user()?.id ?? null);
  readonly unitReady = computed(() => !this.unitContext || this.unitContext.state() === 'ready');
  private readonly unitId = computed(() => this.unitContext?.selectedId() ?? null);
  readonly unitLabel = computed(() => this.unitContext?.selectedUnit()?.name ?? 'Todas las unidades productivas');
  private catalogRequest?: Subscription;
  private previewRequest?: Subscription;
  private exportRequest?: Subscription;
  private exportKey?: { fingerprint: string; key: string };
  private scope = { unit: this.unitId(), ready: this.unitReady() };
  private readonly sources = signal<ReportSource[]>([]);
  readonly catalogBusy = signal(true);
  readonly catalogError = signal('');
  readonly error = signal('');
  readonly reportPath = '/administracion/reportes/reportes';
  readonly help = reportHelp;
  readonly topics = computed(() => reportTopics.map(topic => ({
    ...topic,
    label: topic.key === 'inventario' ? 'Inventario' : topic.label,
    available: topic.sources.flatMap(key => this.sources().filter(source => source.key === key)),
  })).filter(topic => topic.available.length > 0));
  private readonly mainModules = ['produccion', 'inventario', 'repartos'];
  readonly mainTopics = computed(() => this.mainModules.flatMap(key => this.topics().filter(topic => topic.key === key)));
  readonly extraTopics = computed(() => this.topics().filter(topic => !this.mainModules.includes(topic.key)));
  readonly moreModules = signal(false);
  readonly topicKey = signal('');
  readonly activeTopic = computed(() => this.topics().find(topic => topic.key === this.topicKey())
    ?? this.mainTopics().at(0) ?? this.topics().at(0));
  readonly sections = signal<ReportSection[]>([]);
  readonly moduleCount = computed(() => new Set(this.sections().map(section => section.topic)).size);
  readonly selectedKeys = computed(() => new Set(this.sections().map(section => section.source.key)));
  readonly selected = signal('');
  readonly selectedIndex = computed(() => this.sections().findIndex(section => section.source.key === this.selected()));
  readonly section = computed(() => this.sections().find(section => section.source.key === this.selected()));
  readonly step = signal(1);
  readonly steps = ['Módulos', 'Datos', 'Período', 'Resultado'];
  readonly titles = ['Elige los reportes que quieres incluir', '¿Qué información quieres ver?', '¿Qué período y registros necesitas?', 'Vista previa del reporte'];
  readonly presets: { key: Period; label: string }[] = [
    { key: 'month', label: 'Este mes' }, { key: 'previous', label: 'Mes anterior' },
    { key: 'all', label: 'Todo el historial' },
  ];
  readonly period = signal<Period>('month');
  readonly dates = signal(reportPeriod('month'));
  readonly dateSections = computed(() => this.sections().filter(section => section.source.supports_date_range));
  readonly formats = computed(() => (['xlsx', 'pdf'] as const).filter(format =>
    this.sections().length > 0 && this.sections().every(({ source }) => source.capabilities.export && source.formats.includes(format))));
  readonly readyToQuery = computed(() => this.unitReady() || !this.sections().some(({ source }) => this.usesDashboard(source)));
  readonly results = signal<Partial<Record<string, ReportResult>>>({});
  readonly result = computed(() => this.results()[this.selected()]);
  readonly previewBusy = signal(false);
  readonly sorts = signal<Partial<Record<string, NonNullable<ReportQuery['sorts']>[number]>>>({});
  readonly sort = computed(() => {
    const section = this.section();
    if (!section) return undefined;
    return this.sorts()[section.source.key] ?? this.defaultSort(section);
  });
  readonly previewScope = computed(() => {
    const section = this.section();
    if (!section) return '';
    const scope = this.scopeLabel(section.source);
    if (!section.source.supports_date_range) return scope + ' · Saldo actual';
    const { from, to } = this.dates();
    if (!from && !to) return scope + ' · Todo el historial';
    return scope + ' · ' + (from ? formatReportCell(from, 'date') : 'Inicio del historial') + ' al ' + (to ? formatReportCell(to, 'date') : 'Último registro');
  });
  readonly sectionFields = computed(() => ({
    columns: reportColumns(this.section()?.source.columns ?? {}),
    metrics: this.fields(this.section()?.source.metrics),
    groupings: this.fields(this.section()?.source.groupings),
  }));
  readonly exportBusy = signal(false);
  readonly exportFile = signal<ReportExport | null>(null);
  readonly exportError = signal('');
  readonly downloadBusy = signal(false);

  constructor() {
    addIcons({ appsOutline, arrowBackOutline, arrowDownOutline, arrowForwardOutline, arrowUpOutline, calendarOutline, carOutline, constructOutline, cubeOutline, documentTextOutline, downloadOutline, eggOutline, gridOutline, heartOutline, peopleOutline, trashOutline });
    effect(() => {
      const actor = this.actor();
      untracked(() => {
        this.sections.set([]);
        this.selected.set('');
        this.topicKey.set('');
        this.moreModules.set(false);
        this.exportKey = undefined;
        this.step.set(1);
        this.invalidate();
        this.loadCatalog(actor);
      });
    });
    effect(() => {
      const unit = this.unitId();
      const ready = this.unitReady();
      untracked(() => {
        if (this.scope.unit === unit && this.scope.ready === ready) return;
        this.scope = { unit, ready };
        if (!this.sections().some(({ source }) => this.usesDashboard(source))) return;
        for (const section of this.sections()) {
          if (!this.usesDashboard(section.source)) continue;
          for (const filter of section.filters) {
            if (!['poultry_house_id', 'flock_id', 'stock_location_id'].includes(filter.key)) continue;
            filter.value.reset('', { emitEvent: false });
            filter.selectedLabel = null;
          }
        }
        this.invalidate();
        if (ready && this.step() === 4) this.preview();
      });
    });
  }

  loadCatalog(actor = this.actor()): void {
    this.catalogRequest?.unsubscribe();
    this.sources.set([]);
    this.catalogError.set('');
    this.catalogBusy.set(true);
    this.catalogRequest = this.api.sources().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.catalogBusy.set(false)),
    ).subscribe({
      next: response => { if (this.actor() === actor) this.sources.set(response.data); },
      error: error => { if (this.actor() === actor) this.catalogError.set(this.message(error, 'No se pudieron cargar los reportes.')); },
    });
  }

  title(source: ReportSource): string { return reportNames[source.key] ?? source.label; }
  toggleMoreModules(): void { this.moreModules.update(open => !open); }
  usesDashboard(source: ReportSource): boolean { return !!this.unitContext && !!source.filters['production_unit_id']; }
  scopeLabel(source: ReportSource): string {
    if (this.usesDashboard(source)) return this.unitReady() ? this.unitLabel() : 'Unidad productiva pendiente';
    return source.filters['production_unit_id'] ? 'Unidades productivas autorizadas' : 'Alcance general';
  }

  toggle(source: ReportSource, topic: typeof reportTopics[number]): void {
    if (this.selectedKeys().has(source.key)) {
      this.remove(source.key);
      return;
    }
    const visibleColumns = new Set(reportColumns(source.columns).map(column => column.key));
    const columns = source.default_columns.filter(key => visibleColumns.has(key));
    this.sections.update(sections => [...sections, {
      source, title: this.title(source), topic: topic.label, icon: topic.icon,
      columns, groupings: [], metrics: [], summary: false,
      filters: Object.entries(source.filters)
        .filter(([key, definition]) => definition.operators.length && !(key === 'production_unit_id' && this.usesDashboard(source)))
        .map(([key, definition]) => ({ key, definition, value: new FormControl('', { nonNullable: true }), selectedLabel: null })),
    }]);
    this.invalidate();
  }

  remove(key: string): void {
    this.sections.update(sections => sections.filter(section => section.source.key !== key));
    if (this.selected() === key) this.selected.set(this.sections()[0]?.source.key ?? '');
    this.invalidate();
  }

  move(index: number, offset: number): void {
    const sections = [...this.sections()];
    const destination = index + offset;
    if (!sections[destination]) return;
    [sections[index], sections[destination]] = [sections[destination], sections[index]];
    this.sections.set(sections);
    this.invalidate();
  }

  select(key: string): void {
    if (this.selected() === key) return;
    this.selected.set(key);
    if (this.step() === 4) this.preview();
  }

  selectFrom(event: Event): void {
    this.select((event.target as HTMLSelectElement).value);
  }

  private fields(fields?: Record<string, ReportField>): (ReportField & { key: string })[] {
    return Object.entries(fields ?? {}).map(([key, metadata]) => ({ key, ...metadata }));
  }

  configure(key: string, changes: Partial<Pick<ReportSection, 'columns' | 'summary' | 'groupings' | 'metrics'>>): void {
    this.sections.update(sections => sections.map(section => section.source.key === key ? { ...section, ...changes } : section));
    this.invalidate();
  }

  setPeriod(period: Period): void {
    this.period.set(period);
    if (period !== 'custom') this.dates.set(reportPeriod(period));
    this.invalidate();
  }

  changeDate(field: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.period.set('custom');
    this.dates.update(dates => ({ ...dates, [field]: value }));
    this.invalidate();
  }

  invalidate(): void {
    this.previewRequest?.unsubscribe();
    this.exportRequest?.unsubscribe();
    this.error.set('');
    this.exportError.set('');
    this.results.set({});
    this.sorts.set({});
    this.exportFile.set(null);
  }

  goTo(step: number): void {
    if (step < 1 || step > this.steps.length || step === this.step()) return;
    if (step >= 2 && this.moduleCount() < 2) {
      this.error.set('Selecciona datos de al menos dos módulos.');
      return;
    }
    if (step >= 3) {
      const incomplete = this.sections().find(section => section.summary ? !section.metrics.length : !section.columns.length);
      if (incomplete) {
        this.selected.set(incomplete.source.key);
        this.error.set('Selecciona al menos una columna o un indicador para «' + incomplete.title + '».');
        return;
      }
    }
    if (step === 4 && !this.buildQueries()) return;
    if (!this.selectedKeys().has(this.selected())) this.selected.set(this.sections()[0]?.source.key ?? '');
    this.error.set('');
    this.step.set(step);
    if (step === 4) this.preview();
    afterNextRender({ write: () => this.stepHeading()?.nativeElement.focus() }, { injector: this.injector });
  }

  changeSort(field: string): void {
    const current = this.sort();
    const direction = current?.field === field && current.direction === 'asc' ? 'desc' : 'asc';
    this.sorts.update(sorts => ({ ...sorts, [this.selected()]: { field, direction } }));
    this.results.update(results => ({ ...results, [this.selected()]: undefined }));
    this.preview(1);
  }

  preview(page?: number): void {
    this.previewRequest?.unsubscribe();
    this.error.set('');
    const section = this.section();
    if (!section || !this.readyToQuery() || (page === undefined && this.result())) return;
    const key = section.source.key;
    const query = this.buildQueries()?.find(item => item.source_key === key)?.query;
    if (!query) return;
    const actor = this.actor();
    const unit = this.unitId();
    const scoped = this.usesDashboard(section.source);
    this.previewBusy.set(true);
    this.previewRequest = this.api.preview(key, { ...query, page: page ?? 1 }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.previewBusy.set(false)),
    ).subscribe({
      next: response => {
        if (actor === this.actor() && (!scoped || unit === this.unitId())) {
          this.results.update(results => ({ ...results, [key]: response.data }));
        }
      },
      error: error => { this.error.set(this.message(error, 'No se pudo cargar la vista previa.')); },
    });
  }

  export(format: ReportExport['format']): void {
    if (this.exportBusy() || !this.formats().includes(format)) return;
    const sections = this.buildQueries();
    if (!sections) return;
    const fingerprint = JSON.stringify([this.actor(), format, sections]);
    const key = this.exportKey?.fingerprint === fingerprint ? this.exportKey.key : crypto.randomUUID();
    this.exportKey = { fingerprint, key };
    const actor = this.actor();
    const unit = this.unitId();
    const scoped = this.sections().some(({ source }) => this.usesDashboard(source));
    this.exportBusy.set(true);
    this.exportFile.set(null);
    this.exportError.set('');
    this.exportRequest = this.api.requestCombinedExport(sections, format, key).pipe(
      switchMap(response => ['pending', 'processing'].includes(response.data.status)
        ? this.api.watchExport(response.data.id) : of(response)),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.exportBusy.set(false)),
    ).subscribe({
      next: ({ data }) => {
        if (actor !== this.actor() || scoped && unit !== this.unitId()) return;
        this.exportFile.set(data);
        if (['completed', 'failed', 'expired'].includes(data.status)) this.exportKey = undefined;
      },
      error: error => this.exportError.set(this.message(error, 'No se pudo preparar el archivo.')),
    });
  }

  async download(item: ReportExport): Promise<void> {
    if (this.downloadBusy()) return;
    const actor = this.actor();
    this.exportError.set('');
    this.downloadBusy.set(true);
    try { await this.api.download(item); }
    catch (error) { if (actor === this.actor()) this.exportError.set(this.message(error, 'No se pudo descargar el archivo.')); }
    finally { if (!this.destroyRef.destroyed) this.downloadBusy.set(false); }
  }

  private buildQueries(): CombinedReportSection[] | null {
    if (!this.readyToQuery()) {
      this.error.set('Espera a que se cargue la unidad productiva del panel.');
      return null;
    }
    let title = '';
    try {
      return this.sections().map(section => {
        const { source, summary } = section;
        title = section.title;
        const { from, to } = this.dates();
        const maxDays = source.limits.max_range_days;
        if (source.supports_date_range && maxDays > 0 && from && to && (Date.parse(to) - Date.parse(from)) / 86400000 > maxDays) {
          throw new Error('El período admite hasta ' + maxDays + ' días.');
        }
        const filters = section.filters.map(filter => ({
          field: filter.key, operator: filter.definition.operators[0], value: filter.value.value,
        }));
        const unit = this.unitId();
        if (this.usesDashboard(source) && unit !== null) {
          filters.push({ field: 'production_unit_id', operator: 'eq', value: String(unit) });
        }
        const sort = this.sorts()[source.key] ?? this.defaultSort(section);
        const query = queryFromForm(source, {
          columns: summary ? source.default_columns : section.columns,
          groupings: summary ? section.groupings : [], metrics: summary ? section.metrics : [],
          from: source.supports_date_range ? from : '', to: source.supports_date_range ? to : '',
          sort: sort?.field ?? '', direction: sort?.direction ?? 'asc',
          filters,
        });
        if (!sort || !(sort.field in source.sorts)) query.sorts = [];
        return { source_key: source.key, query };
      });
    } catch (error) {
      this.error.set(title + ' · ' + this.message(error, 'Revisa los filtros de esta sección.'));
      return null;
    }
  }

  private defaultSort(section: ReportSection): NonNullable<ReportQuery['sorts']>[number] | undefined {
    const [field, direction] = section.source.default_sort.split(':');
    const resolvedField = section.summary
      ? [field, ...section.groupings, ...section.metrics].find(key => (section.groupings.includes(key) || section.metrics.includes(key)) && key in section.source.sorts)
      : field;
    return resolvedField ? { field: resolvedField, direction: direction === 'desc' ? 'desc' : 'asc' } : undefined;
  }

  private message(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') return error.error.message;
    return error instanceof Error ? error.message : fallback;
  }
}
