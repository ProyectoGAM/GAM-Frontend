import { Component, computed, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { EggStockApi } from '../../services/egg-stock.api';
import { createIdempotencyKey, formatQuantity } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { EggStockMovementType, EggStockRevision, EggStockStatus, EggStockTransaction } from '../../interfaces/inventory';
import { LoadState, MutationState } from '../../types/inventory-state.type';
import { InventoryConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-inventory-egg-movement-detail',
  templateUrl: './egg-movement-detail.page.html',
  styleUrl: './egg-movement-detail.page.scss',
  imports: [InventoryConfirmationDialogComponent, ReactiveFormsModule, RouterLink],
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
  @ViewChild(InventoryConfirmationDialogComponent) private cancellationDialog!: InventoryConfirmationDialogComponent;
  readonly activeAction = signal<'correct' | 'cancel'>('correct');
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
      this.correctionForm.patchValue({ quantity: '', occurred_at: item.occurred_at.slice(0, 10), reason: item.reason, notes: item.notes ?? '' });
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
      this.correctionKey = null; this.mutation.set('success'); this.success.set('Corrección registrada. El historial conserva la cantidad anterior y la nueva.'); await this.load();
    } catch (error) { this.mutation.set('error'); this.error.set(inventoryErrorMessage(error, 'No se pudo guardar la corrección. Recarga para ver si alguien ya modificó este movimiento.')); }
  }

  requestCancel(event: Event): void {
    const item = this.movement();
    if (!item || !this.canAdjust() || item.status !== 'recorded' || item.type === 'collection_receipt' || this.cancellationForm.invalid || this.mutation() === 'submitting') {
      this.cancellationForm.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.success.set(null);
    this.cancellationDialog.open(event.currentTarget as HTMLElement | null);
  }

  async cancel(): Promise<void> {
    const item = this.movement();
    if (!item || !this.canAdjust() || item.status !== 'recorded' || item.type === 'collection_receipt' || this.cancellationForm.invalid || this.mutation() === 'submitting') {
      this.cancellationForm.markAllAsTouched();
      return;
    }
    this.mutation.set('submitting'); this.error.set(null); this.success.set(null); this.cancellationKey ??= createIdempotencyKey();
    try {
      await firstValueFrom(this.api.cancel(item.id, { version: item.version, correction_reason: this.cancellationForm.controls.correction_reason.value }, this.cancellationKey));
      this.cancellationKey = null; this.mutation.set('success'); this.success.set('Movimiento cancelado. El registro original se conserva.');
      this.cancellationDialog.close();
      await this.load();
    } catch (error) { this.mutation.set('error'); this.error.set(inventoryErrorMessage(error, 'No se pudo cancelar. Recarga para ver si alguien ya modificó este movimiento.')); }
  }
  selectAction(action: 'correct' | 'cancel'): void { this.activeAction.set(action); this.error.set(null); this.success.set(null); }
  typeLabel(type: EggStockMovementType): string { return ({ collection_receipt: 'Ingreso por producción', manual_receipt: 'Ingreso manual', distribution_preparation: 'Preparación de reparto', loss: 'Pérdida' } satisfies Record<EggStockMovementType, string>)[type]; }
  sourceLabel(item: EggStockTransaction): string { return item.type === 'collection_receipt' || item.reference?.type === 'egg_collection' ? 'Producción' : item.reference ? 'Otro registro' : 'Registro manual'; }
  revisionQuantities(item: EggStockRevision): string | null {
    const previous = item.before['quantity'];
    const current = item.after['quantity'];
    if ((typeof previous !== 'number' && typeof previous !== 'string') || (typeof current !== 'number' && typeof current !== 'string') || !Number.isFinite(Number(previous)) || !Number.isFinite(Number(current))) return null;
    return `${this.quantity(Number(previous))} → ${this.quantity(Number(current))}`;
  }
  statusLabel(status: EggStockStatus): string { return status === 'recorded' ? 'Registrado' : 'Cancelado'; }
  date(value: string): string { return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  quantity(value: number): string { return `${formatQuantity(String(value))} huevos`; }
}
