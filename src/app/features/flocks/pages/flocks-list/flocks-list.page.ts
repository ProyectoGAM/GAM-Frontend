import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonSpinner, IonToast } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, chevronForwardOutline, closeOutline, funnelOutline, searchOutline } from 'ionicons/icons';
import {
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  forkJoin,
  map,
  shareReplay,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PoultryHouseListItem } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { Flock, FlockListItem } from '../../interfaces/flock.interface';
import { FlocksApi } from '../../services/flocks.api';
import { formatFlockEntryDate } from '../../services/flock-entry-date';

type ListState = 'loading' | 'success' | 'empty' | 'error' | 'offline' | 'forbidden' | 'context-error';

@Component({
  selector: 'app-flocks-list-page',
  templateUrl: './flocks-list.page.html',
  styleUrl: './flocks-list.page.scss',
  imports: [IonButton, IonIcon, IonSpinner, IonToast, RouterLink],
})
export class FlocksListPage {
  @ViewChild('filtersDialog', { static: true }) private readonly filtersDialog!: ElementRef<HTMLDialogElement>;

  private readonly api = inject(FlocksApi);
  private readonly productionUnits = inject(ProductionUnitsService);
  readonly unitContext = inject(AdminUnitContextService);
  readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadCount = signal(0);
  private returnFocusTo: HTMLElement | null = null;
  private readonly poultryHouses$ = this.productionUnits.listAllPoultryHouses().pipe(
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly state = signal<ListState>('loading');
  readonly flocks = signal<readonly FlockListItem[]>([]);
  readonly searchQuery = signal('');
  readonly draftUnitId = signal<number | null>(null);
  readonly notice = signal('');
  readonly activeFilterCount = computed(() => this.unitContext.selectedId() === null ? 0 : 1);
  readonly draftResultCount = computed(() => {
    const draft = this.draftUnitId();
    const selected = this.unitContext.selectedId();
    if (draft === selected) return this.flocks().length;
    if (selected === null) return this.flocks().filter((flock) => flock.production_unit_id === draft).length;
    return null;
  });

  constructor() {
    addIcons({ addOutline, chevronForwardOutline, closeOutline, funnelOutline, searchOutline });

    const search$ = toObservable(this.searchQuery).pipe(
      debounceTime(250),
      startWith(this.searchQuery()),
      distinctUntilChanged(),
    );

    combineLatest({
      contextState: toObservable(this.unitContext.state),
      unitId: toObservable(this.unitContext.selectedId),
      search: search$,
      reload: toObservable(this.reloadCount),
    }).pipe(
      tap(({ contextState }) => {
        this.state.set(contextState === 'error' ? 'context-error' : 'loading');
      }),
      switchMap(({ contextState, unitId, search }) => {
        if (contextState !== 'ready') return EMPTY;

        this.state.set('loading');
        return forkJoin({
          flocks: this.api.list({
            ...(unitId === null ? {} : { production_unit_id: unitId }),
            ...(search.trim() ? { search: search.trim() } : {}),
          }),
          poultryHouses: this.poultryHouses$,
        }).pipe(
          map(({ flocks, poultryHouses }) => this.toListItems(flocks, poultryHouses)),
          catchError((error: unknown) => {
            this.state.set(this.errorState(error));
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((flocks) => {
      this.flocks.set(flocks);
      this.state.set(flocks.length ? 'success' : 'empty');
    });
  }

  retry(): void {
    if (this.unitContext.state() !== 'ready') {
      void this.unitContext.load();
      return;
    }

    this.reloadCount.update((count) => count + 1);
  }

  openFilters(trigger: HTMLElement): void {
    this.draftUnitId.set(this.unitContext.selectedId());
    this.returnFocusTo = trigger;
    if (!this.filtersDialog.nativeElement.open) this.filtersDialog.nativeElement.showModal();
  }

  closeFilters(): void {
    if (this.filtersDialog.nativeElement.open) this.filtersDialog.nativeElement.close();
    if (this.returnFocusTo?.isConnected) this.returnFocusTo.focus();
    this.returnFocusTo = null;
  }

  onFilterCancel(event: Event): void {
    event.preventDefault();
    this.closeFilters();
  }

  setDraftUnit(value: string): void {
    this.draftUnitId.set(value === '' ? null : Number(value));
  }

  applyFilters(): void {
    this.unitContext.select(this.draftUnitId());
    this.closeFilters();
  }

  clearUnitFilter(): void {
    if (this.auth.isAdmin()) this.unitContext.select(null);
  }

  showUpcoming(): void {
    this.notice.set('El detalle del lote estará disponible próximamente.');
  }

  private toListItems(flocks: Flock[], houses: readonly PoultryHouseListItem[]): FlockListItem[] {
    const houseNames = new Map(houses.map((house) => [house.id, house.name]));

    return flocks.map((flock) => ({
      ...flock,
      poultry_house_name: houseNames.get(flock.poultry_house_id) ?? 'Galpón no disponible',
      entry_date_display: formatFlockEntryDate(flock.entry_date),
    }));
  }

  private errorState(error: unknown): ListState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 0) return 'offline';
    }

    return 'error';
  }
}
