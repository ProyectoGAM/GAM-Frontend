import { Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { buildOutline, chevronForwardOutline, funnelOutline, searchOutline } from 'ionicons/icons';
import { forkJoin } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { parseUyuAmount } from '../../../../shared/utils/uyu-money';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { MaintenanceCostTotal } from '../../interfaces/installation-maintenance.interface';
import { PoultryHouseListItem, PoultryHouseType } from '../../interfaces/production-unit.interface';
import { InstallationMaintenanceService } from '../../services/installation-maintenance.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { formatMaintenanceCost, maintenanceError } from '../../services/maintenance-presentation';
import { MaintenanceInstallationOrder } from '../../types/installation-maintenance.type';

function searchable(value: string): string {
  return value.toLocaleLowerCase('es-UY').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function compareCosts(first: bigint | null, second: bigint | null, order: MaintenanceInstallationOrder): number {
  if (first === second) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  const ascending = first < second ? -1 : 1;
  return order === 'cost-asc' ? ascending : -ascending;
}

@Component({
  selector: 'app-maintenance-installations-page',
  imports: [RouterLink, IonButton, IonIcon, IonSpinner, FilterDialogComponent],
  templateUrl: './maintenance-installations.page.html',
  styleUrl: './maintenance-installations.page.scss',
})
export class MaintenanceInstallationsPage implements OnInit {
  private readonly api = inject(ProductionUnitsService);
  private readonly maintenanceApi = inject(InstallationMaintenanceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterDialog = viewChild.required(FilterDialogComponent);
  readonly unitContext = inject(AdminUnitContextService);
  readonly isAdmin = inject(AuthStore).isAdmin;
  readonly state = signal<'loading' | 'success' | 'error'>('loading');
  readonly error = signal('');
  readonly installations = signal<PoultryHouseListItem[]>([]);
  private readonly costTotals = signal(new Map<number, MaintenanceCostTotal[] | null>());
  readonly query = signal('');
  readonly type = signal<PoultryHouseType | 'all'>('all');
  readonly order = signal<MaintenanceInstallationOrder>('name');
  private readonly draftUnitId = signal<number | null | undefined>(undefined);
  readonly draftType = signal<PoultryHouseType | 'all'>('all');
  readonly draftOrder = signal<MaintenanceInstallationOrder>('name');
  readonly selectedDraftUnitId = computed(() => {
    const draft = this.draftUnitId();
    return draft === undefined ? this.unitContext.selectedId() : draft;
  });
  readonly selectedUnitName = computed(() => this.unitContext.units().find((unit) => unit.id === this.unitContext.selectedId())?.name);
  readonly activeFilterCount = computed(() => Number(this.unitContext.selectedId() !== null)
    + Number(this.type() !== 'all') + Number(this.order() !== 'name'));
  readonly visibleInstallations = computed(() => {
    const unitId = this.unitContext.selectedId();
    const query = searchable(this.query().trim());
    const type = this.type();
    const order = this.order();
    const totalsById = this.costTotals();
    return this.installations().filter((house) => (unitId === null || house.productionUnit.id === unitId)
      && (type === 'all' || house.type === type)
      && searchable(`${house.name} ${house.productionUnit.name}`).includes(query))
      .map((house) => {
        const totals = totalsById.get(house.id);
        const uyu = totals?.find(({ currency }) => currency === 'UYU');
        return {
          house,
          costLabels: totals?.map(formatMaintenanceCost) ?? totals,
          uyuCost: uyu ? parseUyuAmount(uyu.amount) : null,
        };
      })
      .sort((a, b) => (order === 'name' ? 0 : compareCosts(a.uyuCost, b.uyuCost, order))
        || a.house.name.localeCompare(b.house.name, 'es-UY')
        || a.house.productionUnit.name.localeCompare(b.house.productionUnit.name, 'es-UY'));
  });
  readonly hasUnavailableCosts = computed(() => this.visibleInstallations().some((row) => row.costLabels === null));

  constructor() { addIcons({ buildOutline, chevronForwardOutline, funnelOutline, searchOutline }); }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.state.set('loading'); this.error.set('');
    forkJoin({ poultry: this.api.listAllPoultryHouses(), feed: this.api.listAllFeedPlants() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ poultry, feed }) => {
          const installations = [...poultry, ...feed];
          this.installations.set(installations);
          this.state.set('success');
          this.loadCosts(installations.map(({ id }) => id));
        },
        error: (error: unknown) => { this.error.set(maintenanceError(error, 'No se pudieron cargar las instalaciones. Volvé a intentarlo.')); this.state.set('error'); },
      });
  }

  retryCosts(): void {
    this.loadCosts(this.visibleInstallations().filter((row) => row.costLabels === null).map(({ house }) => house.id));
  }

  private loadCosts(houseIds: readonly number[]): void {
    this.costTotals.update((totals) => {
      const pending = new Map(totals);
      for (const id of houseIds) pending.delete(id);
      return pending;
    });
    this.maintenanceApi.totalCosts(houseIds).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ houseId, totals }) => {
      this.costTotals.update((current) => new Map(current).set(houseId, totals));
    });
  }

  search(event: Event): void { if (event.target instanceof HTMLInputElement) this.query.set(event.target.value); }

  openFilters(trigger: HTMLElement): void {
    this.draftUnitId.set(undefined);
    this.draftType.set(this.type());
    this.draftOrder.set(this.order());
    this.filterDialog().open(trigger);
  }

  clearFilters(): void {
    this.draftUnitId.set(this.isAdmin() ? null : undefined);
    this.draftType.set('all');
    this.draftOrder.set('name');
  }

  applyFilters(): void {
    const unitId = this.draftUnitId();
    if (unitId !== undefined && this.unitContext.state() === 'ready') this.unitContext.select(unitId);
    this.type.set(this.draftType());
    this.order.set(this.draftOrder());
    this.filterDialog().close();
  }

  changeUnit(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    this.draftUnitId.set(event.target.value === '' ? null : Number(event.target.value));
  }

  changeType(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const type = event.target.value;
    if (type === 'all' || type === 'poultry' || type === 'feed') this.draftType.set(type);
  }

  changeOrder(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const order = event.target.value;
    if (order === 'name' || order === 'cost-desc' || order === 'cost-asc') this.draftOrder.set(order);
  }
}
