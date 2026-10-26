import { Component, ElementRef, computed, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cubeOutline, warningOutline, locationOutline, optionsOutline, swapHorizontalOutline, eggOutline, leafOutline, settingsOutline, listOutline, chevronForwardOutline } from 'ionicons/icons';

import { AuthStore } from '../../../../core/auth/auth.store';
import { CatalogHeaderComponent } from '../../components/catalog-header/catalog-header.component';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import { applyInventoryValidationErrors, inventoryErrorMessage } from '../../services/inventory-errors';
import { decimalCompare, formatQuantity, formatStockQuantity, formatQuantityInput, isDiscreteUnit, unitLabel } from '../../services/inventory-format';
import { LoadState } from '../../types/inventory-state.type';
import { InventoryBalanceFilters, PaginatedResponse, ProductKind, ReferenceOptions, StockBalance, StockLocation } from '../../interfaces/inventory';

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
  imports: [ReactiveFormsModule, RouterLink, IonIcon, CatalogHeaderComponent, SearchableSelectComponent],
})
export class StockPage {
  readonly auth = inject(AuthStore);
  private readonly locationsApi = inject(StockLocationsApi);
  readonly locations = signal<StockLocation[]>([]);
  readonly filtersOpen = signal(false);
  readonly belowMinimumCount = computed(() => this.balances().filter((balance) => decimalCompare(balance.available_quantity, balance.minimum_quantity) < 0).length);
  readonly locationCount = computed(() => new Set(this.balances().map((balance) => balance.stock_location_id)).size);
  readonly resultSummary = computed(() => this.meta()?.total === 1 ? '1 saldo encontrado' : `${this.meta()?.total ?? 0} saldos encontrados`);
  readonly rows = computed(() => this.balances().map((balance) => {
    const location = this.locations().find((item) => item.id === balance.stock_location_id) ?? balance.stock_location;
    const houseId = balance.stock_location.poultry_house_id ?? location.poultry_house_id;
    const unit = location.production_unit ?? balance.stock_location.production_unit;
    return {
      balance,
      locationName: balance.stock_location.poultry_house_name ?? location.poultry_house_name ?? location.name,
      unitName: unit?.name,
      plantPath: houseId && unit ? ['/administracion/unidades-productivas', unit.id, 'galpon', houseId] : null,
      available: formatStockQuantity(balance.available_quantity, balance.product.base_unit),
      minimum: formatStockQuantity(balance.minimum_quantity, balance.product.base_unit),
      status: this.status(balance),
      statusClass: this.statusClass(balance),
    };
  }));
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
  readonly minimumBalance = signal<StockBalance | null>(null);
  readonly minimumUnit = signal<string | null>(null);
  readonly minimumSaving = signal(false);
  readonly minimumError = signal<string | null>(null);
  readonly minimumForm = new FormGroup({
    minimum_quantity: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d{1,6})?$/)],
    }),
  });
  private originalMinimum: string | null = null;
  private minimumReturnFocusTo: HTMLElement | null = null;
  @ViewChild('minimumDialog', { static: true }) private readonly minimumDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('minimumInput', { static: true }) private readonly minimumInput!: ElementRef<HTMLInputElement>;
  readonly filters = new FormGroup({
    product_id: new FormControl('', { nonNullable: true }),
    stock_location_id: new FormControl('', { nonNullable: true }),
    below_minimum: new FormControl(false, { nonNullable: true }),
  });
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.manage') === true);
  readonly canRegisterMovement = computed(() => this.auth.isAdmin()
    || this.auth.user()?.permissions.some((permission) => permission === 'inventory.move' || permission === 'inventory.adjust') === true);
  private loadVersion = 0;

  constructor() {
    addIcons({ cubeOutline, warningOutline, locationOutline, optionsOutline, swapHorizontalOutline, eggOutline, leafOutline, settingsOutline, listOutline, chevronForwardOutline });
    void this.loadReferences();
    void this.loadLocations();
    void this.load();
  }

  async load(page = 1): Promise<void> {
    const version = ++this.loadVersion;
    this.state.set('loading');
    this.error.set(null);
    this.success.set(null);
    try {
      const response = await firstValueFrom(this.api.balances(this.filterValues(page)));
      if (version !== this.loadVersion) return;
      this.balances.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.loadVersion) return;
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudieron cargar las existencias.'));
    }
  }

  private async loadLocations(): Promise<void> {
    try {
      const first = await firstValueFrom(this.locationsApi.list({ per_page: 100, page: 1 }));
      const locations = [...first.data];
      for (let page = 2; page <= first.meta.last_page; page += 1) {
        const response = await firstValueFrom(this.locationsApi.list({ per_page: 100, page }));
        locations.push(...response.data);
      }
      this.locations.set(locations);
    } catch {
      // Los saldos conservan su nombre; sin la UP no se inventa un enlace a la planta.
      this.locations.set([]);
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

  editMinimum(balance: StockBalance, event: Event): void {
    if (this.minimumSaving()) return;
    const trigger = event.currentTarget;
    this.minimumReturnFocusTo = trigger instanceof HTMLElement ? trigger : null;
    this.minimumBalance.set(balance);
    this.originalMinimum = balance.minimum_quantity;
    this.minimumUnit.set(balance.product.base_unit);
    this.minimumError.set(null);
    this.updateMinimumValidators(balance.product.base_unit);
    this.minimumForm.setValue({ minimum_quantity: formatQuantityInput(balance.minimum_quantity) });
    this.minimumDialog.nativeElement.showModal();
    this.minimumInput.nativeElement.focus();
  }

  cancelMinimum(): void {
    if (this.minimumSaving()) return;
    this.closeMinimum();
  }

  onMinimumDialogCancel(event: Event): void {
    event.preventDefault();
    this.cancelMinimum();
  }

  private closeMinimum(): void {
    const dialog = this.minimumDialog.nativeElement;
    if (dialog.open) dialog.close();
    this.originalMinimum = null;
    this.minimumBalance.set(null);
    this.minimumUnit.set(null);
    this.minimumError.set(null);
    this.updateMinimumValidators(null);
    this.minimumForm.reset();
    if (this.minimumReturnFocusTo?.isConnected) this.minimumReturnFocusTo.focus();
    this.minimumReturnFocusTo = null;
  }

  minimumIsDiscrete(): boolean { return isDiscreteUnit(this.minimumUnit()); }

  minimumInputMode(): 'numeric' | 'decimal' { return this.minimumIsDiscrete() ? 'numeric' : 'decimal'; }

  async saveMinimum(): Promise<void> {
    if (this.minimumSaving() || !this.canManage()) return;
    const balance = this.minimumBalance();
    if (!balance) return;
    if (this.minimumForm.invalid) {
      this.minimumForm.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.success.set(null);
    this.minimumError.set(null);
    this.minimumSaving.set(true);
    try {
      const input = this.minimumForm.controls.minimum_quantity.value.trim();
      const originalMinimum = this.originalMinimum;
      const minimum = originalMinimum !== null && input === formatQuantityInput(originalMinimum)
        ? originalMinimum
        : input.replace(',', '.');
      const response = await firstValueFrom(this.api.setMinimumStock(balance.id, minimum));
      this.balances.update((items) => items.map((item) => item.id === balance.id ? response.data : item));
      if (this.filters.controls.below_minimum.value && decimalCompare(response.data.available_quantity, response.data.minimum_quantity) >= 0) {
        await this.load(this.meta()?.current_page ?? 1);
      }
      this.success.set('Stock mínimo actualizado.');
      this.closeMinimum();
    } catch (error) {
      applyInventoryValidationErrors(this.minimumForm, error);
      this.minimumError.set(inventoryErrorMessage(error, 'No se pudo actualizar el stock mínimo.'));
    } finally {
      this.minimumSaving.set(false);
    }
  }

  hasActiveFilters(): boolean {
    const value = this.filters.getRawValue();
    return Boolean(value.product_id || value.stock_location_id || value.below_minimum);
  }

  status(balance: StockBalance): 'Normal' | 'Bajo mínimo' | 'Sin stock' | 'Stock negativo' {
    if (decimalCompare(balance.available_quantity, '0') < 0) return 'Stock negativo';
    if (decimalCompare(balance.available_quantity, '0') === 0) return 'Sin stock';
    return decimalCompare(balance.available_quantity, balance.minimum_quantity) < 0 ? 'Bajo mínimo' : 'Normal';
  }

  statusClass(balance: StockBalance): string {
    return ({ Normal: 'normal', 'Bajo mínimo': 'bajo-stock', 'Sin stock': 'sin-stock', 'Stock negativo': 'sin-stock' } as const)[this.status(balance)];
  }

  kindLabel(kind: ProductKind): string { return PRODUCT_KIND_LABELS[kind] ?? PRODUCT_KIND_LABELS.other; }

  format(value: string, unit: string): string {
    return formatQuantity(value, unit);
  }
  minimumUnitLabel(): string { return unitLabel(this.minimumUnit() ?? ''); }

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
