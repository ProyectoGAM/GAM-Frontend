import { Component, computed, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import { createIdempotencyKey, signedQuantity, unitLabel } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { InventoryMovement, InventoryMovementLine, InventoryMovementType } from '../../interfaces/inventory';
import { LoadState, MutationState } from '../../types/inventory-state.type';
import { InventoryConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';

const TYPE_LABELS: Record<InventoryMovementType, string> = {
  opening_balance: 'Saldo inicial', receipt: 'Ingreso', issue: 'Salida', loss: 'Pérdida',
  adjustment: 'Ajuste', transfer: 'Transferencia', reversal: 'Reversión',
};

@Component({
  selector: 'app-inventory-movement-detail',
  templateUrl: './movement-detail.page.html',
  styleUrl: './movement-detail.page.scss',
  imports: [InventoryConfirmationDialogComponent, ReactiveFormsModule, RouterLink],
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
  readonly mutation = signal<MutationState>('idle');
  readonly locationNames = signal<Record<number, string>>({});
  readonly productNames = signal<Record<number, string>>({});
  readonly referencesError = signal<string | null>(null);
  readonly reverseForm = new FormGroup({ reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }) });
  readonly canReverse = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  @ViewChild(InventoryConfirmationDialogComponent) private reversalDialog!: InventoryConfirmationDialogComponent;
  private reversalKey: string | null = null;

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
    if (!movement || !this.canReverse() || this.reverseForm.invalid || this.mutation() === 'submitting') {
      this.reverseForm.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.success.set(null);
    this.reversalDialog.open(event.currentTarget as HTMLElement | null);
  }

  async reverse(): Promise<void> {
    const movement = this.movement();
    if (!movement || !this.canReverse() || this.reverseForm.invalid || this.mutation() === 'submitting') {
      this.reverseForm.markAllAsTouched();
      return;
    }
    this.mutation.set('submitting');
    this.error.set(null);
    this.success.set(null);
    this.reversalKey ??= createIdempotencyKey();
    try {
      await firstValueFrom(this.api.reverse(movement.id, this.reverseForm.controls.reason.value, this.reversalKey));
      this.mutation.set('success');
      this.success.set('Reversión registrada. El movimiento original se conserva en el historial.');
      this.reversalKey = null;
      this.reverseForm.reset();
      this.reversalDialog.close();
      await this.load();
    } catch (error) {
      this.mutation.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo revertir el movimiento. Puedes reintentar con la misma operación.'));
    }
  }
  typeLabel(type: InventoryMovementType): string { return TYPE_LABELS[type] ?? 'Otro movimiento'; }
  productName(line: InventoryMovementLine): string { return line.product?.name || this.productNames()[line.product_id] || 'Producto sin nombre disponible'; }
  locationName(id: number): string { return this.locationNames()[id] ?? 'Ubicación sin nombre disponible'; }
  date(value: string): string { return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  delta(value: string, unit: string): string { return signedQuantity(value, unit); }
  unit(unit: string): string { return unitLabel(unit); }
}
