import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryApi } from '../../services/inventory.api';
import { createIdempotencyKey, formatQuantity, signedQuantity, unitLabel } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { InventoryMovement, InventoryMovementType } from '../../interfaces/inventory';
import { LoadState, MutationState } from '../../types/inventory-state.type';

const TYPE_LABELS: Record<InventoryMovementType, string> = {
  opening_balance: 'Saldo inicial', receipt: 'Ingreso', issue: 'Salida', loss: 'Pérdida',
  adjustment: 'Ajuste', transfer: 'Transferencia', reversal: 'Reversión',
};

@Component({
  selector: 'app-inventory-movement-detail',
  templateUrl: './movement-detail.page.html',
  styleUrl: './movement-detail.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class MovementDetailPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(InventoryApi);
  private readonly route = inject(ActivatedRoute);
  readonly state = signal<LoadState>('idle');
  readonly movement = signal<InventoryMovement | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly mutation = signal<MutationState>('idle');
  readonly reverseForm = new FormGroup({ reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }) });
  readonly canReverse = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  private reversalKey: string | null = null;

  constructor() {
    void this.load();
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

  async reverse(): Promise<void> {
    const movement = this.movement();
    if (!movement || !this.canReverse() || this.reverseForm.invalid || this.mutation() === 'submitting') {
      this.reverseForm.markAllAsTouched();
      return;
    }
    if (!window.confirm('La reversión creará un nuevo movimiento y conservará el original. ¿Continuar?')) return;
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
      await this.load();
    } catch (error) {
      this.mutation.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo revertir el movimiento. Puedes reintentar con la misma operación.'));
    }
  }

  typeLabel(type: InventoryMovementType): string { return TYPE_LABELS[type] ?? type; }
  date(value: string): string { return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  format(value: string, unit: string): string { return formatQuantity(value, unit); }
  delta(value: string, unit: string): string { return signedQuantity(value, unit); }
  unit(unit: string): string { return unitLabel(unit); }
}
