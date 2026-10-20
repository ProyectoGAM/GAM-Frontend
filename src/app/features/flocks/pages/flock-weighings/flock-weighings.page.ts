import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, createOutline, scaleOutline, warningOutline } from 'ionicons/icons';

import { WeighingDistributionChartComponent } from '../../components/weighing-distribution-chart/weighing-distribution-chart.component';
import { WeighingGrowthChartComponent } from '../../components/weighing-growth-chart/weighing-growth-chart.component';
import { dailyWeighingDistribution } from '../../components/weighing-distribution-chart/daily-weighing-distribution';
import { Flock } from '../../interfaces/flock.interface';
import {
  AddDailyWeighingEntry, DailyWeighing, DailyWeighingDetail, DailyWeighingEntry,
  WeighingMode, BreedWeighingSettings, SaveBreedWeighingSettings,
} from '../../interfaces/flock-weighing.interface';
import { dateBefore, FlockDetailService } from '../../services/flock-detail.service';
import { FlockWeighingsService } from '../../services/flock-weighings.service';

type LoadState = 'loading' | 'ready' | 'forbidden' | 'offline' | 'error';
type Tab = 'summary' | 'entry';
interface EntryAttempt { payload: AddDailyWeighingEntry; key: string }

const gramsPattern = /^(?=.*[1-9])(?:0|[1-9]\d{0,12})(?:\.\d)?$/;

const formatGrams = (value: string | number | null | undefined): string => {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number)
    ? new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(number)
    : 'Dato no disponible';
};

const formatDay = (value: string): string => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
};

const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Hora no disponible'
    : new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Montevideo' }).format(date);
};

const localToday = (): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Montevideo',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const problemCode = (error: unknown): string | null => {
  if (!(error instanceof HttpErrorResponse) || !error.error || typeof error.error !== 'object') return null;
  const code = (error.error as Record<string, unknown>)['code'];
  return typeof code === 'string' ? code : null;
};

@Component({
  selector: 'app-flock-weighings-page',
  templateUrl: './flock-weighings.page.html',
  styleUrl: './flock-weighings.page.scss',
  imports: [RouterLink, ReactiveFormsModule, IonIcon, IonSpinner, WeighingDistributionChartComponent, WeighingGrowthChartComponent],
})
export class FlockWeighingsPage {
  readonly formatTime = formatTime;
  readonly formatGrams = formatGrams;
  private readonly route = inject(ActivatedRoute);
  private readonly flocks = inject(FlockDetailService);
  private readonly weighings = inject(FlockWeighingsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly settingsDialog = viewChild<ElementRef<HTMLDialogElement>>('settingsDialog');
  private readonly anomalyDialog = viewChild<ElementRef<HTMLDialogElement>>('anomalyDialog');
  private readonly deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');
  private loadVersion = 0;
  private historyVersion = 0;
  private selectedVersion = 0;
  private todayVersion = 0;
  private evolutionVersion = 0;
  private lastDeleteReason: string | null = null;

  readonly flockId = signal('');
  readonly flock = signal<Flock | null>(null);
  readonly flockState = signal<LoadState>('loading');
  readonly historyState = signal<LoadState>('loading');
  readonly days = signal<DailyWeighing[]>([]);
  readonly historyCursor = signal<string | null>(null);
  readonly historyLoadingMore = signal(false);
  readonly historyMoreError = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly selectedDetail = signal<DailyWeighingDetail | null>(null);
  readonly selectedState = signal<LoadState>('loading');
  readonly settingsState = signal<LoadState>('loading');
  readonly settings = signal<BreedWeighingSettings | null>(null);
  readonly settingsError = signal<string | null>(null);
  readonly savingSettings = signal(false);
  private settingsVersion = 0;
  private settingsAttempt: { payload: SaveBreedWeighingSettings; key: string } | null = null;
  readonly tab = signal<Tab>('summary');
  readonly chartView = signal<'distribution' | 'evolution'>('distribution');
  readonly evolutionPeriod = signal<'7' | '30' | 'all'>('7');
  readonly evolutionState = signal<LoadState>('loading');
  readonly evolutionDays = signal<DailyWeighing[]>([]);
  readonly entryMode = signal<WeighingMode>('individual');
  readonly todayDate = signal(localToday());
  readonly todayState = signal<LoadState>('loading');
  readonly today = signal<DailyWeighingDetail | null>(null);
  readonly todayEntries = signal<DailyWeighingEntry[]>([]);
  readonly todayCursor = signal<string | null>(null);
  readonly todayLoadingMore = signal(false);
  readonly todayMoreError = signal(false);
  readonly entryError = signal<string | null>(null);
  readonly entrySuccess = signal<string | null>(null);
  readonly savingEntry = signal(false);
  readonly entryAttempt = signal<EntryAttempt | null>(null);
  readonly anomalyRange = signal<string | null>(null);
  readonly deletingEntry = signal(false);
  readonly deleteError = signal<string | null>(null);
  readonly deleteTarget = signal<DailyWeighingEntry | null>(null);
  readonly deleteKey = signal<string | null>(null);

  readonly individualWeight = new FormControl('', { nonNullable: true });
  readonly groupCount = new FormControl('', { nonNullable: true });
  readonly groupTotal = new FormControl('', { nonNullable: true });
  readonly deleteReason = new FormControl('', { nonNullable: true });

  readonly backLink = computed(() => `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}`);
  readonly selected = computed(() => this.days().find((day) => day.id === this.selectedId()) ?? null);
  readonly rangeBreedId = computed(() => this.selectedDetail()?.expected_range?.breed_id
    ?? this.selected()?.expected_range?.breed_id ?? this.flock()?.breed_id ?? null);
  readonly entryRangeBreedId = computed(() => this.today()?.expected_range?.breed_id ?? this.flock()?.breed_id ?? null);
  readonly selectedAverage = computed(() => formatGrams(this.selected()?.average_weight_g));
  readonly individualSummary = computed(() => {
    const detail = this.selectedDetail();
    return this.selectedState() === 'ready' && detail ? dailyWeighingDistribution(detail.entries) : null;
  });
  readonly individualAnomalies = computed(() => this.individualSummary()?.bins
    .reduce((total, bin) => total + bin.anomalous, 0) ?? null);
  readonly groupAnomalies = computed(() => {
    const detail = this.selectedDetail();
    return this.selectedState() === 'ready' && detail
      ? detail.entries.filter((entry) => entry.mode === 'group' && entry.outside_expected_range).length : null;
  });
  readonly selectedDate = computed(() => this.selected() ? formatDay(this.selected()!.date) : '');
  readonly historyRows = computed(() => this.days().map((day) => ({
    id: day.id,
    date: formatDay(day.date),
    birds: new Intl.NumberFormat('es-UY').format(day.represented_bird_count),
    average: formatGrams(day.average_weight_g),
    range: day.expected_range
      ? `${formatGrams(day.expected_range.min_weight_g)}–${formatGrams(day.expected_range.max_weight_g)} g`
      : 'Dato no disponible',
    anomalies: day.anomalous_entry_count,
    status: day.status === 'in_progress' ? 'En curso' : 'Cerrado',
  })));
  readonly lastEntry = computed(() => {
    const entry = this.today()?.last_entry;
    if (!entry) return 'Sin ingresos';
    const weight = entry.mode === 'individual'
      ? `${formatGrams(entry.weight_g)} g`
      : `${entry.bird_count} aves · ${formatGrams(entry.average_weight_g)} g/ave`;
    return `${formatTime(entry.occurred_at)} · ${weight}`;
  });
  readonly anomalyAverage = computed(() => {
    const payload = this.entryAttempt()?.payload;
    if (!payload) return '';
    const average = payload.mode === 'individual' ? Number(payload.weight) : Number(payload.total_weight) / payload.bird_count;
    return `${formatGrams(String(average))} g por ave`;
  });

  readonly settingsForm = new FormGroup({
    chick_min_weight: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    chick_max_weight: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    adult_min_weight: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    adult_max_weight: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    addIcons({ arrowBackOutline, createOutline, scaleOutline, warningOutline });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.flockId.set(params.get('id') ?? '');
      this.load();
    });
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'entry') this.loadToday();
  }

  setChartView(view: 'distribution' | 'evolution'): void {
    this.chartView.set(view);
    if (view === 'evolution') this.loadEvolution();
  }

  setEvolutionPeriod(period: string): void {
    if (period !== '7' && period !== '30' && period !== 'all') return;
    this.evolutionPeriod.set(period);
    this.loadEvolution();
  }

  loadEvolution(): void {
    const version = ++this.evolutionVersion;
    const loadVersion = this.loadVersion;
    const period = this.evolutionPeriod();
    const today = localToday();
    this.evolutionState.set('loading');
    this.evolutionDays.set([]);
    this.weighings.dailyEvolution(this.flockId(), period === 'all' ? null : dateBefore(today, Number(period) - 1), today)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (days) => {
          if (version !== this.evolutionVersion || loadVersion !== this.loadVersion) return;
          this.evolutionDays.set(days);
          this.evolutionState.set('ready');
        },
        error: (error: unknown) => {
          if (version === this.evolutionVersion && loadVersion === this.loadVersion) this.evolutionState.set(this.errorState(error));
        },
      });
  }

  setEntryMode(mode: WeighingMode): void {
    this.entryMode.set(mode);
    this.entryError.set(null);
    this.entryAttempt.set(null);
    this.anomalyRange.set(null);
  }

  load(): void {
    const version = ++this.loadVersion;
    const id = this.flockId();
    this.flockState.set('loading');
    this.flock.set(null);
    this.days.set([]);
    this.selectedId.set(null);
    if (!id) { this.flockState.set('error'); return; }
    this.flocks.flock(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (flock) => {
        if (version !== this.loadVersion) return;
        this.flock.set(flock);
        this.flockState.set('ready');
        this.loadHistory();
        this.loadToday();
      },
      error: (error: unknown) => { if (version === this.loadVersion) this.flockState.set(this.errorState(error)); },
    });
  }

  loadHistory(cursor: string | null = null): void {
    const version = this.loadVersion;
    const requestVersion = ++this.historyVersion;
    this.historyMoreError.set(false);
    if (cursor) this.historyLoadingMore.set(true);
    else {
      this.historyState.set('loading');
      this.days.set([]);
      this.historyCursor.set(null);
      if (this.chartView() === 'evolution') this.loadEvolution();
    }
    this.weighings.listDaily(this.flockId(), cursor).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (version !== this.loadVersion || requestVersion !== this.historyVersion) return;
        this.days.set(cursor ? [...this.days(), ...response.data] : response.data);
        this.historyCursor.set(response.next_cursor);
        this.historyState.set('ready');
        this.historyLoadingMore.set(false);
        if (!cursor) this.selectDay(response.data[0]?.id ?? null);
      },
      error: (error: unknown) => {
        if (version !== this.loadVersion || requestVersion !== this.historyVersion) return;
        this.historyLoadingMore.set(false);
        if (cursor) this.historyMoreError.set(true);
        else this.historyState.set(this.errorState(error));
      },
    });
  }

  selectDay(id: string | null): void {
    this.selectedId.set(id);
    this.selectedDetail.set(null);
    const version = ++this.selectedVersion;
    if (!id) {
      this.selectedState.set('ready');
      return;
    }
    this.selectedState.set('loading');
    this.loadSelectedPage(id, null, [], version);
  }

  private loadSelectedPage(id: string, cursor: string | null, entries: DailyWeighingEntry[], version: number): void {
    this.weighings.getDaily(id, cursor).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (detail) => {
        if (version !== this.selectedVersion) return;
        const allEntries = [...entries, ...detail.entries];
        if (detail.next_cursor) this.loadSelectedPage(id, detail.next_cursor, allEntries, version);
        else {
          this.selectedDetail.set({ ...detail, entries: allEntries, next_cursor: null });
          this.selectedState.set('ready');
        }
      },
      error: (error: unknown) => { if (version === this.selectedVersion) this.selectedState.set(this.errorState(error)); },
    });
  }

  loadToday(cursor: string | null = null): void {
    const version = ++this.todayVersion;
    const date = localToday();
    this.todayMoreError.set(false);
    if (cursor) this.todayLoadingMore.set(true);
    else {
      this.todayDate.set(date);
      this.todayState.set('loading');
      this.today.set(null);
      this.todayEntries.set([]);
      this.todayCursor.set(null);
    }
    this.weighings.getDailyByDate(this.flockId(), date, cursor).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (detail) => {
        if (version !== this.todayVersion) return;
        this.today.set(detail);
        this.todayEntries.set(cursor ? [...this.todayEntries(), ...detail.entries] : detail.entries);
        this.todayCursor.set(detail.next_cursor);
        this.todayState.set('ready');
        this.todayLoadingMore.set(false);
      },
      error: (error: unknown) => {
        if (version !== this.todayVersion) return;
        this.todayLoadingMore.set(false);
        if (cursor) { this.todayMoreError.set(true); return; }
        if (!cursor && error instanceof HttpErrorResponse && error.status === 404) {
          this.todayState.set('ready');
          return;
        }
        this.todayState.set(this.errorState(error));
      },
    });
  }

  submitEntry(): void {
    if (this.savingEntry() || this.todayState() !== 'ready') return;
    this.entryError.set(null);
    this.entrySuccess.set(null);
    const payload = this.entryMode() === 'individual' ? this.individualPayload() : this.groupPayload();
    if (!payload) return;
    const previous = this.entryAttempt();
    const key = previous && JSON.stringify(previous.payload) === JSON.stringify(payload)
      ? previous.key : globalThis.crypto.randomUUID();
    this.entryAttempt.set({ payload, key });
    this.anomalyRange.set(null);
    this.saveEntry(payload, key);
  }

  private individualPayload(): AddDailyWeighingEntry | null {
    const weight = this.normalizeGrams(this.individualWeight.value);
    if (!weight) {
      this.entryError.set('Ingresá un peso positivo en gramos, con hasta un decimal.');
      return null;
    }
    return { mode: 'individual', weight };
  }

  private groupPayload(): AddDailyWeighingEntry | null {
    const count = Number(this.groupCount.value);
    const total = this.normalizeGrams(this.groupTotal.value);
    if (!/^\d+$/.test(this.groupCount.value) || !Number.isInteger(count) || count < 1 || count > 2147483647 || !total) {
      this.entryError.set('Ingresá la cantidad de aves y el peso total positivo del grupo en gramos.');
      return null;
    }
    return { mode: 'group', bird_count: count, total_weight: total };
  }

  private normalizeGrams(value: string): string | null {
    const normalized = value.trim().replace(',', '.');
    return gramsPattern.test(normalized) ? normalized : null;
  }

  private saveEntry(payload: AddDailyWeighingEntry, key: string): void {
    this.savingEntry.set(true);
    this.weighings.addDailyEntry(this.flockId(), payload, key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.savingEntry.set(false);
        this.entryAttempt.set(null);
        this.anomalyRange.set(null);
        this.anomalyDialog()?.nativeElement.close();
        if (payload.mode === 'individual') this.individualWeight.reset();
        else { this.groupCount.reset(); this.groupTotal.reset(); }
        this.entrySuccess.set('Ingreso registrado. La muestra y el historial fueron actualizados.');
        this.loadToday();
        this.loadHistory();
      },
      error: (error: unknown) => {
        this.savingEntry.set(false);
        const code = problemCode(error);
        if (code === 'DAILY_WEIGHING_OUT_OF_RANGE_CONFIRMATION_REQUIRED' && !payload.confirm_out_of_range) {
          this.anomalyRange.set(this.confirmationRange(error));
          this.anomalyDialog()?.nativeElement.showModal();
        } else if (code === 'DAILY_WEIGHING_POPULATION_EXCEEDED') {
          this.entryError.set('La muestra superaría la cantidad de aves vivas del lote.');
        } else if (code === 'DAILY_WEIGHING_FLOCK_LIFECYCLE_CONFLICT') {
          this.entryError.set('Este lote ya no admite nuevos pesajes.');
        } else if (error instanceof HttpErrorResponse && error.status === 403) {
          this.entryError.set('No tenés permiso para registrar pesajes.');
        } else if (error instanceof HttpErrorResponse && error.status === 0) {
          this.entryError.set('Sin conexión. Podés reintentar el mismo ingreso.');
        } else {
          this.entryError.set('No se pudo registrar el ingreso. Revisá los datos e intentá de nuevo.');
        }
      },
    });
  }

  confirmAnomaly(): void {
    const attempt = this.entryAttempt();
    if (!attempt || this.savingEntry()) return;
    this.anomalyDialog()?.nativeElement.close();
    this.saveEntry({ ...attempt.payload, confirm_out_of_range: true }, attempt.key);
  }

  private confirmationRange(error: unknown): string | null {
    const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
    const meta: unknown = body && typeof body === 'object' ? (body as Record<string, unknown>)['meta'] : null;
    const limits = meta && typeof meta === 'object' ? meta as Record<string, unknown> : null;
    const current = this.today()?.expected_range;
    const format = (min: unknown, max: unknown): string | null => {
      if ((typeof min !== 'string' && typeof min !== 'number') || (typeof max !== 'string' && typeof max !== 'number')) return null;
      const lower = Number(min);
      const upper = Number(max);
      return Number.isFinite(lower) && Number.isFinite(upper) && lower > 0 && lower < upper
        ? `${formatGrams(lower)}–${formatGrams(upper)} g` : null;
    };
    return format(limits?.['min_weight_g'], limits?.['max_weight_g'])
      ?? format(current?.min_weight_g, current?.max_weight_g);
  }

  cancelAnomaly(): void {
    if (this.savingEntry()) return;
    this.anomalyDialog()?.nativeElement.close();
    this.entryAttempt.set(null);
    this.anomalyRange.set(null);
    this.entryError.set('El ingreso anómalo fue descartado.');
  }

  openDelete(entry: DailyWeighingEntry): void {
    this.deleteTarget.set(entry);
    this.deleteReason.reset();
    this.deleteError.set(null);
    this.deleteKey.set(globalThis.crypto.randomUUID());
    this.lastDeleteReason = null;
    this.deleteDialog()?.nativeElement.showModal();
  }

  cancelDelete(): void {
    if (this.deletingEntry()) return;
    this.deleteDialog()?.nativeElement.close();
    this.deleteTarget.set(null);
    this.deleteKey.set(null);
    this.lastDeleteReason = null;
  }

  confirmDelete(): void {
    const day = this.today();
    const entry = this.deleteTarget();
    const reason = this.deleteReason.value.trim();
    if (!day || !entry || !this.deleteKey() || this.deletingEntry()) return;
    if (reason.length < 3 || reason.length > 1000) {
      this.deleteError.set('Indicá un motivo de entre 3 y 1000 caracteres.');
      return;
    }
    if (this.lastDeleteReason !== null && this.lastDeleteReason !== reason) {
      this.deleteKey.set(globalThis.crypto.randomUUID());
    }
    this.lastDeleteReason = reason;
    const key = this.deleteKey()!;
    this.deletingEntry.set(true);
    this.deleteError.set(null);
    this.weighings.deleteDailyEntry(day.id, entry.id, { version: day.version, reason }, key)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.deletingEntry.set(false);
          this.cancelDelete();
          this.entrySuccess.set('Ingreso eliminado. La muestra fue recalculada.');
          this.loadToday();
          this.loadHistory();
        },
        error: (error: unknown) => {
          this.deletingEntry.set(false);
          if (problemCode(error) === 'DAILY_WEIGHING_VERSION_CONFLICT') {
            this.cancelDelete();
            this.entryError.set('La muestra cambió. Revisá los ingresos actualizados antes de eliminar.');
            this.loadToday();
            this.loadHistory();
          } else if (error instanceof HttpErrorResponse && error.status === 403) {
            this.deleteError.set('No tenés permiso para eliminar este ingreso.');
          } else if (error instanceof HttpErrorResponse && error.status === 0) {
            this.deleteError.set('Sin conexión. Podés reintentar la eliminación.');
          } else {
            this.deleteError.set('No se pudo eliminar el ingreso. Intentá de nuevo.');
          }
        },
      });
  }

  loadSettings(id: number): void {
    const version = ++this.settingsVersion;
    this.settingsAttempt = null;
    this.settingsState.set('loading');
    this.settings.set(null);
    this.settingsError.set(null);
    this.weighings.breedSettings(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => {
        if (version !== this.settingsVersion) return;
        this.settings.set(settings);
        const own = settings.range_overrides;
        const stageRange = (stage: 'chick' | 'adult') => {
          const min = own[`${stage}_min_weight_g`];
          const max = own[`${stage}_max_weight_g`];
          const absent = Number(min) === 0 && Number(max) === 0;
          return {
            min: absent ? settings.expected_ranges?.[stage].min_weight_g ?? '' : min ?? '',
            max: absent ? settings.expected_ranges?.[stage].max_weight_g ?? '' : max ?? '',
          };
        };
        const chick = stageRange('chick');
        const adult = stageRange('adult');
        this.settingsForm.reset({
          chick_min_weight: chick.min,
          chick_max_weight: chick.max,
          adult_min_weight: adult.min,
          adult_max_weight: adult.max,
        });
        this.settingsState.set('ready');
      },
      error: (error: unknown) => {
        if (version !== this.settingsVersion) return;
        this.settingsState.set(this.errorState(error));
        this.settingsError.set(error instanceof HttpErrorResponse && error.status === 403
          ? 'No tenés permiso para consultar esta raza.' : 'No se pudo cargar la raza y sus rangos. Cerrá el formulario e intentá de nuevo.');
      },
    });
  }

  openSettings(context: Tab = 'summary'): void {
    const id = context === 'entry' ? this.entryRangeBreedId() : this.rangeBreedId();
    if (!id || this.savingSettings()) return;
    this.settingsDialog()?.nativeElement.showModal();
    this.loadSettings(id);
  }

  closeSettings(): void {
    if (this.savingSettings()) return;
    ++this.settingsVersion;
    this.settingsDialog()?.nativeElement.close();
  }

  saveSettings(): void {
    const breed = this.settings();
    if (this.savingSettings() || this.settingsState() !== 'ready' || !breed) return;
    const form = this.settingsForm.getRawValue();
    const validStage = (stage: 'chick' | 'adult') => gramsPattern.test(form[`${stage}_min_weight`])
      && gramsPattern.test(form[`${stage}_max_weight`])
      && Number(form[`${stage}_min_weight`]) < Number(form[`${stage}_max_weight`]);
    if (this.settingsForm.invalid || !validStage('chick') || !validStage('adult')) {
      this.settingsError.set('Revisá los rangos: cada mínimo debe ser positivo y menor que su máximo. Los gramos admiten un decimal.');
      return;
    }
    this.settingsError.set(null);
    this.savingSettings.set(true);
    const payload: SaveBreedWeighingSettings = {
      version: breed.version,
      chick_min_weight_g: form.chick_min_weight,
      chick_max_weight_g: form.chick_max_weight,
      adult_min_weight_g: form.adult_min_weight,
      adult_max_weight_g: form.adult_max_weight,
    };
    const previous = this.settingsAttempt;
    const key = previous && JSON.stringify(previous.payload) === JSON.stringify(payload)
      ? previous.key : globalThis.crypto.randomUUID();
    this.settingsAttempt = { payload, key };
    this.weighings.saveBreedSettings(breed.id, payload, key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.savingSettings.set(false);
        this.settingsDialog()?.nativeElement.close();
        this.loadHistory();
        this.loadToday();
      },
      error: (error: unknown) => {
        this.savingSettings.set(false);
        if (problemCode(error) === 'DAILY_WEIGHING_VERSION_CONFLICT' || error instanceof HttpErrorResponse && error.status === 409) {
          this.settingsState.set('error');
          this.settingsError.set('Los rangos de esta raza cambiaron. Cerrá el formulario y volvé a abrirlo para cargar la versión actual.');
        } else if (error instanceof HttpErrorResponse && error.status === 403) {
          this.settingsError.set('No tenés permiso para editar los rangos de esta raza.');
        } else {
          this.settingsError.set('No se pudo guardar el rango. Revisá los datos e intentá de nuevo.');
        }
      },
    });
  }

  private errorState(error: unknown): LoadState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 0) return 'offline';
    }
    return 'error';
  }
}
