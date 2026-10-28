import { Component, computed, inject, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import { signedQuantity, unitLabel } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { InventoryMovement, InventoryMovementLine, InventoryMovementType } from '../../interfaces/inventory';
import { LoadState } from '../../types/inventory-state.type';
import { MovementReversalDialogComponent } from '../../components/movement-reversal-dialog/movement-reversal-dialog.component';

const TYPE_LABELS: Record<InventoryMovementType, string> = {
  opening_balance: 'Saldo inicial', receipt: 'Ingreso', issue: 'Salida', loss: 'Pérdida',
  adjustment: 'Ajuste', transfer: 'Transferencia', reversal: 'Reversión',
};

@Component({
  selector: 'app-inventory-movement-detail',
  templateUrl: './movement-detail.page.html',
  styleUrl: './movement-detail.page.scss',
  imports: [MovementReversalDialogComponent, RouterLink],
})
export class MovementDetailPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(InventoryApi);
  private readonly references = inject(InventoryReferenceApi);
  private readonly route = inject(ActivatedRoute);
  readonly state = signal<LoadState>('idle');
  readonly movement = signal<InventoryMovement | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly locationNames = signal<Record<number, string>>({});
  readonly productNames = signal<Record<number, string>>({});
  readonly referencesError = signal<string | null>(null);
  readonly canReverse = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  @ViewChild(MovementReversalDialogComponent) private reversalDialog!: MovementReversalDialogComponent;

  constructor() {
    void this.load();
    void this.loadLocationNames();
  }

  async loadLocationNames(): Promise<void> {
    this.referencesError.set(null);
    try {
      const options = (await firstValueFrom(this.references.options())).data;
      this.locationNames.set(Object.fromEntries(options.stock_locations.map(({ value, label }) => [Number(value), label])));
      this.productNames.set(Object.fromEntries(options.products.map(({ value, label }) => [Number(value), label])));
    } catch (error) {
      this.referencesError.set(inventoryErrorMessage(error, 'No se pudieron cargar los nombres de productos y ubicaciones.'));
    }
  }

  async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('movement'));
    if (!Number.isInteger(id)) {
      this.state.set('error');
      this.error.set('El movimiento solicitado no es válido.');
      return;
    }
    this.state.set('loading');
    this.error.set(null);
    try {
      this.movement.set((await firstValueFrom(this.api.movement(id))).data);
      this.state.set('success');
    } catch (error) {
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo cargar el detalle del movimiento.'));
    }
  }

  requestReverse(event: Event): void {
    const movement = this.movement();
    if (!movement || !this.canReverse() || this.state() !== 'success') return;
    this.error.set(null);
    this.success.set(null);
    this.reversalDialog.open(movement, this.typeLabel(movement.type), event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  }

  async onReversed(): Promise<void> {
    this.success.set('Reversión registrada. El movimiento original se conserva en el historial.');
    await this.load();
  }
  typeLabel(type: InventoryMovementType): string { return TYPE_LABELS[type] ?? 'Otro movimiento'; }
  productName(line: InventoryMovementLine): string { return line.product?.name || this.productNames()[line.product_id] || 'Producto sin nombre disponible'; }
  locationName(id: number): string { return this.locationNames()[id] ?? 'Ubicación sin nombre disponible'; }
  date(value: string): string { return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  delta(value: string, unit: string): string { return signedQuantity(value, unit); }
  unit(unit: string): string { return unitLabel(unit); }
}
