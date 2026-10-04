import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, funnelOutline, searchOutline } from 'ionicons/icons';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { HouseFilterSheetComponent } from '../../components/house-filter-sheet/house-filter-sheet.component';
import { ProductionUnitHouseCardComponent } from '../../components/production-unit-house-card/production-unit-house-card.component';
import { PoultryHouseListItem, ProductionUnit } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import {
  HouseOccupancyFilter, HouseStatusFilter, houseOccupancyOptions, houseStatusOptions,
} from '../../types/house-filter.type';

type ListState = 'loading' | 'success' | 'empty' | 'error' | 'offline' | 'forbidden';

function searchable(value: string): string {
  return value.toLocaleLowerCase('es-UY').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

@Component({
  selector: 'app-poultry-houses-list-page',
  templateUrl: './poultry-houses-list.page.html',
  styleUrl: './poultry-houses-list.page.scss',
  imports: [IonButton, IonIcon, IonSpinner, HouseFilterSheetComponent, ProductionUnitHouseCardComponent, RouterLink],
})
export class PoultryHousesListPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly unitContext = inject(AdminUnitContextService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild(HouseFilterSheetComponent) private readonly filterSheet!: HouseFilterSheetComponent;

  readonly isFeedList = this.route.snapshot.data['houseType'] === 'feed';
  readonly state = signal<ListState>('loading');
  readonly houses = signal<PoultryHouseListItem[]>([]);
  readonly searchQuery = signal('');
  readonly selectedUnitId = signal<number | null>(null);
  readonly selectedStatus = signal<HouseStatusFilter>('all');
  readonly selectedOccupancy = signal<HouseOccupancyFilter>('all');
  readonly draftUnitId = signal<number | null>(null);
  readonly draftStatus = signal<HouseStatusFilter>('all');
  readonly draftOccupancy = signal<HouseOccupancyFilter>('all');

  readonly globalUnitId = computed(() => this.unitContext?.selectedId() ?? null);
  readonly availableUnits = computed(() => {
    const contextUnits = this.unitContext?.units?.() ?? [];
    if (contextUnits.length) return [...contextUnits].sort((a, b) => a.name.localeCompare(b.name, 'es-UY'));
    const units = new Map<number, ProductionUnit>();
    for (const house of this.houses()) units.set(house.productionUnit.id, house.productionUnit);
    return [...units.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-UY'));
  });
  readonly globalUnitName = computed(() => this.unitContext?.selectedUnit?.()?.name
    ?? this.availableUnits().find((unit) => unit.id === this.globalUnitId())?.name
    ?? 'UP seleccionada');
  readonly selectedUnitName = computed(() => this.availableUnits()
    .find((unit) => unit.id === this.selectedUnitId())?.name ?? '');
  readonly selectedStatusLabel = computed(() => houseStatusOptions
    .find((option) => option.value === this.selectedStatus())?.label ?? '');
  readonly selectedOccupancyLabel = computed(() => houseOccupancyOptions
    .find((option) => option.value === this.selectedOccupancy())?.label ?? '');
  readonly activeFilterCount = computed(() => Number(this.globalUnitId() === null && this.selectedUnitId() !== null)
    + Number(this.selectedStatus() !== 'all')
    + Number(!this.isFeedList && this.selectedOccupancy() !== 'all'));
  readonly hasFilters = computed(() => this.globalUnitId() !== null || this.activeFilterCount() > 0
    || this.searchQuery().trim().length > 0);
  readonly visibleHouses = computed(() => this.filterHouses(
    this.selectedUnitId(), this.selectedStatus(), this.selectedOccupancy(),
  ));
  readonly draftMatches = computed(() => this.filterHouses(
    this.draftUnitId(), this.draftStatus(), this.draftOccupancy(),
  ));
  readonly activeHouses = computed(() => this.visibleHouses().filter((house) => house.status !== 'inactive'));
  readonly inactiveHouses = computed(() => this.visibleHouses().filter((house) => house.status === 'inactive'));

  constructor() {
    addIcons({ closeOutline, funnelOutline, searchOutline });
    let previousGlobalUnitId = this.globalUnitId();
    effect(() => {
      const globalUnitId = this.globalUnitId();
      if (globalUnitId !== previousGlobalUnitId) {
        this.selectedUnitId.set(null);
        this.draftUnitId.set(null);
        previousGlobalUnitId = globalUnitId;
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  openFilters(): void {
    this.draftUnitId.set(this.globalUnitId() === null ? this.selectedUnitId() : null);
    this.draftStatus.set(this.selectedStatus());
    this.draftOccupancy.set(this.selectedOccupancy());
    this.filterSheet.open();
  }

  clearDraft(): void {
    this.draftUnitId.set(null);
    this.draftStatus.set('all');
    this.draftOccupancy.set('all');
  }

  applyFilters(): void {
    this.selectedUnitId.set(this.globalUnitId() === null ? this.draftUnitId() : null);
    this.selectedStatus.set(this.draftStatus());
    this.selectedOccupancy.set(this.isFeedList ? 'all' : this.draftOccupancy());
    this.filterSheet.close();
  }

  private filterHouses(unitId: number | null, status: HouseStatusFilter, occupancy: HouseOccupancyFilter): PoultryHouseListItem[] {
    const effectiveUnitId = this.globalUnitId() ?? unitId;
    const query = searchable(this.searchQuery().trim());
    return this.houses().filter((house) => {
      if (effectiveUnitId !== null && house.productionUnit.id !== effectiveUnitId) return false;
      if (status !== 'all' && house.status !== status) return false;
      if (!this.isFeedList && occupancy !== 'all') {
        const count = house.current_occupancy;
        if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return false;
        if (occupancy === 'occupied' && count === 0) return false;
        if (occupancy === 'empty' && count !== 0) return false;
      }
      if (!query) return true;
      const unit = house.productionUnit;
      return searchable([
        house.name, unit.name, unit.locality?.name ?? '', unit.locality?.department?.name ?? '', unit.address ?? '',
      ].join(' ')).includes(query);
    });
  }

  private load(): void {
    this.state.set('loading');
    const request = this.isFeedList ? this.service.listAllFeedPlants() : this.service.listAllPoultryHouses();
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (houses) => {
        this.houses.set(houses);
        this.state.set(houses.length ? 'success' : 'empty');
      },
      error: (error: unknown) => this.state.set(this.errorState(error)),
    });
  }

  private errorState(error: unknown): ListState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 0) return 'offline';
    }

    return 'error';
  }
}
