import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, calendarOutline, chevronForwardOutline, documentTextOutline,
  eggOutline, notificationsOutline, scaleOutline,
} from 'ionicons/icons';
import { Observable } from 'rxjs';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { CollectionSummaryComponent } from '../../components/collection-summary/collection-summary.component';
import { CollectionSummary } from '../../interfaces/flock-collection.interface';
import { DetailMetric, FlockHouseOrigin, FlockLatestWeighing } from '../../interfaces/flock-detail.interface';
import { FlockFeedingOverview } from '../../interfaces/flock-feeding.interface';
import { Flock } from '../../interfaces/flock.interface';
import { FlockCollectionsService } from '../../services/flock-collections.service';
import { FlockDetailService, todayInLotsTimezone } from '../../services/flock-detail.service';
import { feedingDate } from '../../services/feeding-summary';
import { FlockFeedingService } from '../../services/flock-feeding.service';

type PageState = 'loading' | 'ready' | 'offline' | 'forbidden' | 'not-found' | 'error';

const loadingMetric = <T>(): DetailMetric<T> => ({ state: 'loading', value: null });

@Component({
  selector: 'app-flock-detail-page',
  templateUrl: './flock-detail.page.html',
  styleUrl: './flock-detail.page.scss',
  imports: [IonIcon, IonSpinner, RouterLink, CollectionSummaryComponent],
})
export class FlockDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly detail = inject(FlockDetailService);
  private readonly collections = inject(FlockCollectionsService);
  private readonly feedingService = inject(FlockFeedingService);
  private readonly productionUnits = inject(ProductionUnitsService);
  private readonly unitContext = inject(AdminUnitContextService);
  private readonly destroyRef = inject(DestroyRef);
  private loadVersion = 0;
  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly returnHouse = computed<FlockHouseOrigin | null>(() => {
    const params = this.queryParams();
    const unit = params?.get('unitId') ?? '';
    const house = params?.get('houseId') ?? '';
    return params?.get('lotFrom') === 'house' && /^[1-9]\d*$/.test(unit) && /^[1-9]\d*$/.test(house)
      && Number.isSafeInteger(Number(unit)) && Number.isSafeInteger(Number(house))
      ? { unitId: Number(unit), houseId: Number(house) } : null;
  });
  readonly backLink = computed(() => {
    const house = this.returnHouse();
    return house ? ['/administracion/unidades-productivas', house.unitId, 'galpon', house.houseId]
      : ['/administracion/lotes/lotes'];
  });
  readonly planQueryParams = computed(() => {
    const house = this.returnHouse();
    return house ? { from: 'flock', lotFrom: 'house', unitId: house.unitId, houseId: house.houseId } : { from: 'flock' };
  });

  readonly state = signal<PageState>('loading');
  readonly flock = signal<Flock | null>(null);
  readonly houseName = signal<string | null>(null);
  readonly mortality = signal<DetailMetric<number>>(loadingMetric());
  readonly weighing = signal<DetailMetric<FlockLatestWeighing>>(loadingMetric());
  readonly eggs = signal<DetailMetric<CollectionSummary>>(loadingMetric());
  readonly feeding = signal<DetailMetric<FlockFeedingOverview>>(loadingMetric());
  readonly nextFeedingDateText = computed(() => {
    const next = this.feeding().value?.nextChange;
    return next ? `${feedingDate(next.date)} · Día ${next.day}` : '';
  });
  readonly flockId = signal('');
  readonly unitName = computed(() => this.unitContext.units()
    .find((unit) => unit.id === this.flock()?.production_unit_id)?.name ?? null);
  readonly planLink = computed(() => `/administracion/manejo-lotes/planes/lotes/${encodeURIComponent(this.flockId())}`);
  readonly weighingsLink = computed(() => `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}/pesajes`);
  readonly mortalityLink = computed(() => `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}/mortalidad`);
  readonly collectionsLink = computed(() => `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}/recoleccion`);
  readonly statusText = computed(() => this.flock() ? this.statusLabel(this.flock()!.status) : '');
  readonly entryDateText = computed(() => this.flock() ? this.entryDate(this.flock()!.entry_date) : '');
  readonly dayNumber = computed(() => this.flock() ? this.flock()!.age_days + 1 : null);
  readonly mortalityText = computed(() => this.number(this.mortality().value ?? 0));
  readonly liveBirdsText = computed(() => this.number(Math.max(0, this.flock()?.current_quantity ?? 0)));
  readonly negativeBalanceText = computed(() => {
    const balance = this.flock()?.current_quantity;
    return balance !== undefined && balance < 0 ? this.number(balance) : null;
  });
  readonly weighingText = computed(() => this.weighing().value ? this.weightKg(this.weighing().value!.average_weight_g) : '');
  readonly weighingDateText = computed(() => this.weighing().value ? this.shortDate(this.weighing().value!.date) : '');

  constructor() {
    addIcons({
      arrowBackOutline, calendarOutline, chevronForwardOutline, documentTextOutline,
      eggOutline, notificationsOutline, scaleOutline,
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.flockId.set(params.get('id') ?? '');
      this.load();
    });
  }

  load(): void {
    const version = ++this.loadVersion;
    const id = this.flockId();
    this.state.set('loading');
    this.flock.set(null);
    this.houseName.set(null);
    this.mortality.set(loadingMetric());
    this.weighing.set(loadingMetric());
    this.eggs.set(loadingMetric());
    this.feeding.set(loadingMetric());
    if (!id) {
      this.state.set('not-found');
      return;
    }

    this.detail.flock(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (flock) => {
        if (version !== this.loadVersion) return;
        this.flock.set(flock);
        this.state.set('ready');
        this.loadHouse(flock, version);
        this.loadMetrics(flock, version);
      },
      error: (error: unknown) => {
        if (version === this.loadVersion) this.state.set(this.errorState(error));
      },
    });
  }

  private statusLabel(status: Flock['status']): string {
    return { active: 'Activo', quarantined: 'En cuarentena', finished: 'Finalizado' }[status];
  }

  private entryDate(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? 'Dato no disponible'
      : new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed);
  }

  private shortDate(date: string): string {
    const dateOnly = date.length === 10;
    const parsed = new Date(dateOnly ? `${date}T00:00:00Z` : date);
    if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible';
    const parts = new Intl.DateTimeFormat('es-UY', {
      day: '2-digit', month: 'short', timeZone: dateOnly ? 'UTC' : 'America/Montevideo',
    }).formatToParts(parsed);
    const day = parts.find((part) => part.type === 'day')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value.replace(/\.$/, '') ?? '';
    return `${day} ${month}`;
  }

  private number(value: number, maximumFractionDigits = 0): string {
    return new Intl.NumberFormat('es-UY', { maximumFractionDigits }).format(value);
  }

  private weightKg(grams: string): string {
    const value = Number(grams);
    return Number.isFinite(value)
      ? new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1000)
      : 'Dato no disponible';
  }

  private loadHouse(flock: Flock, version: number): void {
    this.productionUnits.getPoultryHouseById(flock.poultry_house_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (version === this.loadVersion) this.houseName.set(response.data.name);
        },
        error: () => {
          if (version === this.loadVersion) this.houseName.set('Galpón no disponible');
        },
      });
  }

  private loadMetrics(flock: Flock, version: number): void {
    const today = todayInLotsTimezone();
    this.loadMetric(this.mortality, this.detail.mortalityTotal(flock.id), version);
    this.loadMetric(this.weighing, this.detail.latestWeighing(flock.id), version);
    this.loadMetric(this.eggs, this.collections.summary(flock.id, flock.entry_date, today), version);
    this.loadMetric(this.feeding, this.feedingService.overview(flock.id, flock.production_unit_id), version);
  }

  private loadMetric<T>(target: WritableSignal<DetailMetric<T>>, source: Observable<T | null>, version: number): void {
    source.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        if (version === this.loadVersion) target.set({ state: 'ready', value });
      },
      error: () => {
        if (version === this.loadVersion) target.set({ state: 'unavailable', value: null });
      },
    });
  }

  private errorState(error: unknown): PageState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) return 'not-found';
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 0) return 'offline';
    }
    return 'error';
  }
}
