import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
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
  imports: [ReactiveFormsModule, RouterLink],
})
export class MovementsPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(InventoryApi);
  private readonly references = inject(InventoryReferenceApi);
  readonly state = signal<LoadState>('idle');
  readonly movements = signal<InventoryMovement[]>([]);
  readonly meta = signal<PaginatedResponse<InventoryMovement>['meta'] | null>(null);
  readonly options = signal<ReferenceOptions | null>(null);
  readonly referencesState = signal<LoadState>('idle');
  readonly referencesError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
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

  constructor() {
    void this.loadReferences();
    void this.load();
  }

  async load(page = 1): Promise<void> {
    this.state.set('loading');
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.movements(this.filterValues(page)));
      this.movements.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudieron cargar los movimientos.'));
    }
  }

  async loadReferences(): Promise<void> {
    this.referencesState.set('loading');
    this.referencesError.set(null);
    try {
      const options = (await firstValueFrom(this.references.options())).data;
      this.options.set(options);
      this.referencesState.set(options.products.length && options.stock_locations.length ? 'success' : 'empty');
    } catch (error) {
      this.referencesState.set('error');
      this.referencesError.set(inventoryErrorMessage(error, 'No se pudieron cargar las opciones de filtro.'));
    }
  }

  hasActiveFilters(): boolean {
    const value = this.filters.getRawValue();
    return Object.values(value).some(Boolean);
  }

  clearFilters(): void {
    this.filters.reset({ type: '', product_id: '', stock_location_id: '', supplier_id: '', from: '', to: '' });
    void this.load();
  }

  typeLabel(type: InventoryMovementType): string {
    return TYPE_LABELS[type] ?? 'Otro movimiento';
  }

  date(value: string): string {
    return new Intl.DateTimeFormat('es-UY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  private filterValues(page: number): InventoryMovementFilters {
    const value = this.filters.getRawValue();
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
