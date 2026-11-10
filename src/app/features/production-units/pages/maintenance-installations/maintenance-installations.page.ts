import { Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { buildOutline, chevronForwardOutline, funnelOutline, searchOutline } from 'ionicons/icons';
import { forkJoin } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { PoultryHouseListItem, PoultryHouseType } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { maintenanceError } from '../../services/maintenance-presentation';

function searchable(value: string): string {
  return value.toLocaleLowerCase('es-UY').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

@Component({
  selector: 'app-maintenance-installations-page',
  imports: [RouterLink, IonButton, IonIcon, IonSpinner, FilterDialogComponent],
  templateUrl: './maintenance-installations.page.html',
  styleUrl: './maintenance-installations.page.scss',
})
export class MaintenanceInstallationsPage implements OnInit {
  private readonly api = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterDialog = viewChild.required(FilterDialogComponent);
  readonly unitContext = inject(AdminUnitContextService);
  readonly isAdmin = inject(AuthStore).isAdmin;
  readonly state = signal<'loading' | 'success' | 'error'>('loading');
  readonly error = signal('');
  readonly installations = signal<PoultryHouseListItem[]>([]);
  readonly query = signal('');
  readonly type = signal<PoultryHouseType | 'all'>('all');
  private readonly draftUnitId = signal<number | null | undefined>(undefined);
  readonly draftType = signal<PoultryHouseType | 'all'>('all');
  readonly selectedDraftUnitId = computed(() => {
    const draft = this.draftUnitId();
    return draft === undefined ? this.unitContext.selectedId() : draft;
  });
  readonly selectedUnitName = computed(() => this.unitContext.units().find((unit) => unit.id === this.unitContext.selectedId())?.name);
  readonly activeFilterCount = computed(() => Number(this.unitContext.selectedId() !== null) + Number(this.type() !== 'all'));
  readonly visibleInstallations = computed(() => {
    const unitId = this.unitContext.selectedId();
    const query = searchable(this.query().trim());
    const type = this.type();
    return this.installations().filter((house) => (unitId === null || house.productionUnit.id === unitId)
      && (type === 'all' || house.type === type)
      && searchable(`${house.name} ${house.productionUnit.name}`).includes(query))
      .sort((a, b) => a.productionUnit.name.localeCompare(b.productionUnit.name, 'es-UY') || a.name.localeCompare(b.name, 'es-UY'));
  });

  constructor() { addIcons({ buildOutline, chevronForwardOutline, funnelOutline, searchOutline }); }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.state.set('loading'); this.error.set('');
    forkJoin({ poultry: this.api.listAllPoultryHouses(), feed: this.api.listAllFeedPlants() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ poultry, feed }) => { this.installations.set([...poultry, ...feed]); this.state.set('success'); },
        error: (error: unknown) => { this.error.set(maintenanceError(error, 'No se pudieron cargar las instalaciones. Volvé a intentarlo.')); this.state.set('error'); },
      });
  }

  search(event: Event): void { if (event.target instanceof HTMLInputElement) this.query.set(event.target.value); }

  openFilters(trigger: HTMLElement): void {
    this.draftUnitId.set(undefined);
    this.draftType.set(this.type());
    this.filterDialog().open(trigger);
  }

  clearFilters(): void {
    this.draftUnitId.set(this.isAdmin() ? null : undefined);
    this.draftType.set('all');
  }

  applyFilters(): void {
    const unitId = this.draftUnitId();
    if (unitId !== undefined && this.unitContext.state() === 'ready') this.unitContext.select(unitId);
    this.type.set(this.draftType());
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
}
