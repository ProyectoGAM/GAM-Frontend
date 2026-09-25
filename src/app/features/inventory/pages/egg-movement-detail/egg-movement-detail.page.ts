import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { EggStockApi } from '../../services/egg-stock.api';
import { createIdempotencyKey, formatQuantity } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { EggStockMovementType, EggStockStatus, EggStockTransaction } from '../../interfaces/inventory';
import { LoadState, MutationState } from '../../types/inventory-state.type';

@Component({
  selector: 'app-inventory-egg-movement-detail',
  templateUrl: './egg-movement-detail.page.html',
  styleUrl: './egg-movement-detail.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class EggMovementDetailPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(EggStockApi);
  private readonly route = inject(ActivatedRoute);
  readonly state = signal<LoadState>('idle');
  readonly mutation = signal<MutationState>('idle');
  readonly movement = signal<EggStockTransaction | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canAdjust = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.adjust') === true);
  readonly correctionForm = new FormGroup({ quantity: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^[1-9]\d*$/)] }), occurred_at: new FormControl('', { nonNullable: true }), correction_reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }), reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  readonly cancellationForm = new FormGroup({ correction_reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }) });
  private correctionKey: string | null = null;
  private cancellationKey: string | null = null;

  constructor() { void this.load(); }

  async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('movement');
    if (!id) { this.state.set('error'); this.error.set('El movimiento solicitado no es válido.'); return; }
    this.state.set('loading');
    this.error.set(null);
    try {
      const item = (await firstValueFrom(this.api.movement(id))).data;
      this.movement.set(item);
      this.correctionForm.patchValue({ quantity: String(item.quantity), occurred_at: item.occurred_at.slice(0, 10), reason: item.reason, notes: item.notes ?? '' });
      this.state.set('success');
    } catch (error) {
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo cargar el movimiento de huevos.'));
    }
  }

  async correct(): Promise<void> {
    const item = this.movement();
    if (!item || !this.canAdjust() || item.status !== 'recorded' || item.type === 'collection_receipt' || this.correctionForm.invalid || this.mutation() === 'submitting') { this.correctionForm.markAllAsTouched(); return; }
    this.mutation.set('submitting'); this.error.set(null); this.success.set(null); this.correctionKey ??= createIdempotencyKey();
    const value = this.correctionForm.getRawValue();
    try {
      await firstValueFrom(this.api.correct(item.id, { version: item.version, quantity: value.quantity ? Number(value.quantity) : undefined, occurred_at: value.occurred_at || undefined, correction_reason: value.correction_reason, reason: value.reason || undefined, notes: value.notes || undefined }, this.correctionKey));
      this.correctionKey = null; this.mutation.set('success'); this.success.set('Corrección registrada con nueva revisión.'); await this.load();
    } catch (error) { this.mutation.set('error'); this.error.set(inventoryErrorMessage(error, 'No se pudo corregir. El movimiento pudo cambiar de versión; recarga antes de reintentar.')); }
  }

  async cancel(): Promise<void> {
    const item = this.movement();
    if (!item || !this.canAdjust() || item.status !== 'recorded' || item.type === 'collection_receipt' || this.cancellationForm.invalid || this.mutation() === 'submitting') { this.cancellationForm.markAllAsTouched(); return; }
    if (!window.confirm('La cancelación conservará el movimiento y generará trazabilidad. ¿Continuar?')) return;
    this.mutation.set('submitting'); this.error.set(null); this.success.set(null); this.cancellationKey ??= createIdempotencyKey();
    try {
      await firstValueFrom(this.api.cancel(item.id, { version: item.version, correction_reason: this.cancellationForm.controls.correction_reason.value }, this.cancellationKey));
      this.cancellationKey = null; this.mutation.set('success'); this.success.set('Movimiento cancelado. El registro original se conserva.'); await this.load();
    } catch (error) { this.mutation.set('error'); this.error.set(inventoryErrorMessage(error, 'No se pudo cancelar. El movimiento pudo cambiar de versión; recarga antes de reintentar.')); }
  }

  typeLabel(type: EggStockMovementType): string { return ({ collection_receipt: 'Ingreso por producción', manual_receipt: 'Ingreso manual', distribution_preparation: 'Preparación de reparto', loss: 'Pérdida' } satisfies Record<EggStockMovementType, string>)[type]; }
  statusLabel(status: EggStockStatus): string { return status === 'recorded' ? 'Registrado' : 'Cancelado'; }
  date(value: string): string { return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  quantity(value: number): string { return `${formatQuantity(String(value))} huevos`; }
}
