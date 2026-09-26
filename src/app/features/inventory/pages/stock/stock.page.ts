import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import { applyInventoryValidationErrors, inventoryErrorMessage } from '../../services/inventory-errors';
import { decimalCompare, formatQuantity, formatQuantityInput, isDiscreteUnit } from '../../services/inventory-format';
import { LoadState } from '../../types/inventory-state.type';
import { InventoryBalanceFilters, PaginatedResponse, ProductKind, ReferenceOptions, StockBalance } from '../../interfaces/inventory';

const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  raw_material: 'Materia prima',
  supply: 'Insumo',
  finished_feed: 'Ración / alimento preparado',
  egg: 'Huevo',
  medicine: 'Medicamento',
  vaccine: 'Vacuna',
  other: 'Otro',
};

@Component({
  selector: 'app-inventory-stock',
  templateUrl: './stock.page.html',
  styleUrl: './stock.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class StockPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(InventoryApi);
  private readonly references = inject(InventoryReferenceApi);
  readonly state = signal<LoadState>('idle');
  readonly balances = signal<StockBalance[]>([]);
  readonly meta = signal<PaginatedResponse<StockBalance>['meta'] | null>(null);
  readonly options = signal<ReferenceOptions | null>(null);
  readonly referencesState = signal<LoadState>('idle');
  readonly referencesError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly minimumEditId = signal<number | null>(null);
  readonly minimumUnit = signal<string | null>(null);
  readonly minimumSaving = signal(false);
  readonly minimumForm = new FormGroup({
    minimum_quantity: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d{1,6})?$/)],
    }),
  });
  private originalMinimum: string | null = null;
  readonly filters = new FormGroup({
    product_id: new FormControl('', { nonNullable: true }),
    stock_location_id: new FormControl('', { nonNullable: true }),
    below_minimum: new FormControl(false, { nonNullable: true }),
  });
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.manage') === true);
  readonly canRegisterMovement = computed(() => this.auth.isAdmin()
    || this.auth.user()?.permissions.some((permission) => permission === 'inventory.move' || permission === 'inventory.adjust') === true);

  constructor() {
    void this.loadReferences();
    void this.load();
  }

  async load(page = 1): Promise<void> {
    this.state.set('loading');
    this.error.set(null);
    this.success.set(null);
    try {
      const response = await firstValueFrom(this.api.balances(this.filterValues(page)));
      this.balances.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudieron cargar las existencias.'));
    }
  }

  async loadReferences(): Promise<void> {
    this.referencesState.set('loading');
    this.referencesError.set(null);
    try {
      const options = (await firstValueFrom(this.references.options())).data;
      this.options.set(options);
      this.referencesState.set(options.products.length && options.stock_locations.length ? 'success' : 'empty');
    } catch {
      this.referencesState.set('error');
      this.referencesError.set('No se pudieron cargar los filtros. Podés reintentarlo.');
      // La tabla sigue siendo útil con los nombres incluidos en cada saldo.
    }
  }

  clearFilters(): void {
    this.filters.reset({ product_id: '', stock_location_id: '', below_minimum: false });
    void this.load();
  }

  editMinimum(balance: StockBalance): void {
    this.originalMinimum = balance.minimum_quantity;
    this.minimumEditId.set(balance.id);
    this.minimumUnit.set(balance.product.base_unit);
    this.updateMinimumValidators(balance.product.base_unit);
    this.minimumForm.setValue({ minimum_quantity: formatQuantityInput(balance.minimum_quantity) });
  }

  cancelMinimum(): void {
    this.originalMinimum = null;
    this.minimumEditId.set(null);
    this.minimumUnit.set(null);
    this.updateMinimumValidators(null);
    this.minimumForm.reset();
  }

  minimumIsDiscrete(): boolean { return isDiscreteUnit(this.minimumUnit()); }

  minimumInputMode(): 'numeric' | 'decimal' { return this.minimumIsDiscrete() ? 'numeric' : 'decimal'; }

  async saveMinimum(balance: StockBalance): Promise<void> {
    if (this.minimumSaving() || !this.canManage()) return;
    if (this.minimumForm.invalid) {
      this.minimumForm.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.success.set(null);
    this.minimumSaving.set(true);
    try {
      const input = this.minimumForm.controls.minimum_quantity.value.trim();
      const originalMinimum = this.originalMinimum;
      const minimum = originalMinimum !== null && input === formatQuantityInput(originalMinimum)
        ? originalMinimum
        : input.replace(',', '.');
      const response = await firstValueFrom(this.api.setMinimumStock(balance.id, minimum));
      this.balances.update((items) => items.map((item) => item.id === balance.id ? response.data : item));
      this.success.set('Stock mínimo actualizado.');
      this.cancelMinimum();
    } catch (error) {
      applyInventoryValidationErrors(this.minimumForm, error);
      this.error.set(inventoryErrorMessage(error, 'No se pudo actualizar el stock mínimo.'));
    } finally {
      this.minimumSaving.set(false);
    }
  }

  hasActiveFilters(): boolean {
    const value = this.filters.getRawValue();
    return Boolean(value.product_id || value.stock_location_id || value.below_minimum);
  }

  status(balance: StockBalance): 'Normal' | 'Bajo stock' | 'Sin stock' {
    if (decimalCompare(balance.available_quantity, '0') === 0) return 'Sin stock';
    return decimalCompare(balance.available_quantity, balance.minimum_quantity) < 0 ? 'Bajo stock' : 'Normal';
  }

  statusClass(balance: StockBalance): string {
    return ({ Normal: 'normal', 'Bajo stock': 'bajo-stock', 'Sin stock': 'sin-stock' } as const)[this.status(balance)];
  }

  kindLabel(kind: ProductKind): string { return PRODUCT_KIND_LABELS[kind] ?? PRODUCT_KIND_LABELS.other; }

  format(value: string, unit: string): string {
    return formatQuantity(value, unit);
  }

  private updateMinimumValidators(unit: string | null): void {
    this.minimumForm.controls.minimum_quantity.setValidators([
      Validators.required,
      Validators.pattern(isDiscreteUnit(unit) ? /^\d+$/ : /^\d+(?:[.,]\d{1,6})?$/),
    ]);
    this.minimumForm.controls.minimum_quantity.updateValueAndValidity({ emitEvent: false });
  }

  private filterValues(page: number): InventoryBalanceFilters {
    const value = this.filters.getRawValue();
    return {
      product_id: value.product_id ? Number(value.product_id) : undefined,
      stock_location_id: value.stock_location_id ? Number(value.stock_location_id) : undefined,
      below_minimum: value.below_minimum || undefined,
      per_page: 25,
      page,
    };
  }
}
