import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { decimalCompare, formatQuantity } from '../../services/inventory-format';
import { LoadState } from '../../types/inventory-state.type';
import { InventoryBalanceFilters, PaginatedResponse, ReferenceOptions, StockBalance } from '../../interfaces/inventory';

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
  readonly error = signal<string | null>(null);
  readonly minimumEditId = signal<number | null>(null);
  readonly minimumForm = new FormGroup({ minimum_quantity: new FormControl('', { nonNullable: true }) });
  readonly filters = new FormGroup({
    product_id: new FormControl('', { nonNullable: true }),
    stock_location_id: new FormControl('', { nonNullable: true }),
    below_minimum: new FormControl(false, { nonNullable: true }),
  });
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.manage') === true);

  constructor() {
    void this.loadReferences();
    void this.load();
  }

  async load(page = 1): Promise<void> {
    this.state.set('loading');
    this.error.set(null);
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
    try {
      this.options.set((await firstValueFrom(this.references.options())).data);
    } catch {
      // La tabla sigue siendo útil con los nombres incluidos en cada saldo.
    }
  }

  clearFilters(): void {
    this.filters.reset({ product_id: '', stock_location_id: '', below_minimum: false });
    void this.load();
  }

  editMinimum(balance: StockBalance): void {
    this.minimumEditId.set(balance.id);
    this.minimumForm.setValue({ minimum_quantity: balance.minimum_quantity });
  }

  cancelMinimum(): void {
    this.minimumEditId.set(null);
    this.minimumForm.reset();
  }

  async saveMinimum(balance: StockBalance): Promise<void> {
    if (this.minimumForm.invalid || !this.canManage()) return;
    try {
      const response = await firstValueFrom(this.api.setMinimumStock(balance.id, this.minimumForm.controls.minimum_quantity.value));
      this.balances.update((items) => items.map((item) => item.id === balance.id ? response.data : item));
      this.cancelMinimum();
    } catch (error) {
      this.error.set(inventoryErrorMessage(error, 'No se pudo actualizar el stock mínimo.'));
    }
  }

  status(balance: StockBalance): 'Normal' | 'Bajo mínimo' | 'Sin stock' {
    if (decimalCompare(balance.available_quantity, '0') === 0) return 'Sin stock';
    return decimalCompare(balance.available_quantity, balance.minimum_quantity) < 0 ? 'Bajo mínimo' : 'Normal';
  }

  statusClass(balance: StockBalance): string {
    return this.status(balance).toLowerCase().replace(' ', '-');
  }

  format(value: string, unit: string): string {
    return formatQuantity(value, unit);
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
