import { Component, DestroyRef, ElementRef, Injector, ViewChild, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { funnelOutline } from 'ionicons/icons';

import { AuthStore } from '../../../../core/auth/auth.store';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { MovementReversalDialogComponent } from '../../components/movement-reversal-dialog/movement-reversal-dialog.component';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { LoadState } from '../../types/inventory-state.type';
import { InventoryMovement, InventoryMovementFilters, InventoryMovementType, PaginatedResponse, ReferenceOptions } from '../../interfaces/inventory';

const TYPE_LABELS: Record<InventoryMovementType, string> = {
  opening_balance: 'Saldo inicial', receipt: 'Ingreso', issue: 'Salida', loss: 'Pérdida',
  adjustment: 'Ajuste', transfer: 'Transferencia', reversal: 'Reversión',
};

@Component({
  selector: 'app-inventory-movements',
  templateUrl: './movements.page.html',
  styleUrl: './movements.page.scss',
  imports: [ReactiveFormsModule, RouterLink, SearchableSelectComponent, IonIcon, FilterDialogComponent, MovementReversalDialogComponent],
})
export class MovementsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  readonly auth = inject(AuthStore);
  readonly unitContext = inject(AdminUnitContextService, { optional: true });
  private readonly api = inject(InventoryApi);
  private readonly references = inject(InventoryReferenceApi);
  readonly state = signal<LoadState>('idle');
  readonly movements = signal<InventoryMovement[]>([]);
  readonly meta = signal<PaginatedResponse<InventoryMovement>['meta'] | null>(null);
  readonly options = signal<ReferenceOptions | null>(null);
  readonly referenceNames = computed(() => ({
    products: Object.fromEntries((this.options()?.products ?? []).map(({ value, label }) => [Number(value), label])),
    locations: Object.fromEntries((this.options()?.stock_locations ?? []).map(({ value, label }) => [Number(value), label])),
  }));
  readonly referencesState = signal<LoadState>('idle');
  readonly referencesError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canReverse = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  readonly canRegisterMovement = computed(() => this.auth.isAdmin()
    || this.auth.user()?.permissions.some((permission) => permission === 'inventory.move' || permission === 'inventory.adjust') === true);
  readonly filters = new FormGroup({
    type: new FormControl('', { nonNullable: true }),
    product_id: new FormControl('', { nonNullable: true }),
    stock_location_id: new FormControl('', { nonNullable: true }),
    supplier_id: new FormControl('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });
  private readonly appliedFilters = signal(this.filters.getRawValue());
  readonly activeFilterCount = computed(() => Object.values(this.appliedFilters()).filter(Boolean).length);
  readonly movementTypes = computed(() => {
    const types = this.options()?.types?.movements;
    return types?.length ? types : Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));
  });
  @ViewChild(FilterDialogComponent, { static: true }) private readonly filterDialog!: FilterDialogComponent;
  @ViewChild(MovementReversalDialogComponent, { static: true }) private readonly reversalDialog!: MovementReversalDialogComponent;
  @ViewChild('movementsHeading', { static: true }) private readonly movementsHeading!: ElementRef<HTMLHeadingElement>;
  private loadVersion = 0;
  private referencesVersion = 0;

  constructor() {
    addIcons({ funnelOutline });
    const query = this.route.snapshot.queryParamMap;
    const product = query.get('product_id') ?? '';
    const location = query.get('stock_location_id') ?? '';
    this.filters.patchValue({
      product_id: /^[1-9]\d*$/.test(product) ? product : '',
      stock_location_id: /^[1-9]\d*$/.test(location) ? location : '',
    });
    this.appliedFilters.set(this.filters.getRawValue());
    void this.loadReferences();
    void this.load();
  }

  async load(page = 1): Promise<void> {
    const version = ++this.loadVersion;
    this.state.set('loading');
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.movements(this.filterValues(page)));
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.movements.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudieron cargar los movimientos.'));
    }
  }

  async loadReferences(): Promise<void> {
    const version = ++this.referencesVersion;
    this.referencesState.set('loading');
    this.referencesError.set(null);
    try {
      const options = (await firstValueFrom(this.references.options())).data;
      if (version !== this.referencesVersion || this.destroyRef.destroyed) return;
      this.options.set(options);
      this.referencesState.set(options.products.length && options.stock_locations.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.referencesVersion || this.destroyRef.destroyed) return;
      this.referencesState.set('error');
      this.referencesError.set(inventoryErrorMessage(error, 'No se pudieron cargar las opciones de filtro.'));
    }
  }

  hasActiveFilters(): boolean {
    return this.activeFilterCount() > 0;
  }

  clearFilters(): void {
    this.clearDraftFilters();
    void this.applyFilters();
  }

  clearDraftFilters(): void {
    this.filters.reset({ type: '', product_id: '', stock_location_id: '', supplier_id: '', from: '', to: '' });
  }

  openFilters(trigger: HTMLElement): void {
    this.filters.reset(this.appliedFilters());
    this.filterDialog.open(trigger);
  }

  async applyFilters(): Promise<void> {
    this.appliedFilters.set(this.filters.getRawValue());
    this.filterDialog.close();
    await this.load();
  }

  typeLabel(type: InventoryMovementType): string {
    return TYPE_LABELS[type] ?? 'Otro movimiento';
  }

  date(value: string): string {
    return new Intl.DateTimeFormat('es-UY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  requestReverse(movement: InventoryMovement, event: Event): void {
    if (!this.canReverse() || this.state() !== 'success') return;
    this.success.set(null);
    this.reversalDialog.open(movement, this.typeLabel(movement.type), event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  }

  async onReversed(): Promise<void> {
    this.success.set('Reversión registrada. El movimiento original se conserva en el historial.');
    await this.load(this.meta()?.current_page ?? 1);
    if (!this.destroyRef.destroyed) afterNextRender(() => this.movementsHeading.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  private filterValues(page: number): InventoryMovementFilters {
    const value = this.appliedFilters();
    return {
      type: (value.type || undefined) as InventoryMovementType | undefined,
      product_id: value.product_id ? Number(value.product_id) : undefined,
      stock_location_id: value.stock_location_id ? Number(value.stock_location_id) : undefined,
      supplier_id: value.supplier_id ? Number(value.supplier_id) : undefined,
      from: value.from || undefined,
      to: value.to || undefined,
      per_page: 25,
      page,
    };
  }
}
