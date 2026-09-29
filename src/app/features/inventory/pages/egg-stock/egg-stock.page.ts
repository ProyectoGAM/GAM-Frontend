import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, calculatorOutline, eggOutline, removeCircleOutline, timeOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { EggStockApi } from '../../services/egg-stock.api';
import { createIdempotencyKey, formatQuantity } from '../../services/inventory-format';
import { applyInventoryValidationErrors, inventoryErrorMessage } from '../../services/inventory-errors';
import { EggStockFilters, EggStockStatus, EggStockTransaction, EggStockMovementType, PaginatedResponse, EggStockPhysicalCountInput } from '../../interfaces/inventory';
import { LoadState, MutationState } from '../../types/inventory-state.type';

@Component({
  selector: 'app-inventory-egg-stock',
  templateUrl: './egg-stock.page.html',
  styleUrl: './egg-stock.page.scss',
  imports: [IonIcon, ReactiveFormsModule, RouterLink],
})
export class EggStockPage {
  readonly auth = inject(AuthStore);
  readonly unitContext = inject(AdminUnitContextService);
  private readonly api = inject(EggStockApi);
  readonly selectedUnit = computed(() => this.unitContext.selectedId());
  readonly selectedUnitName = computed(() => this.unitContext.selectedUnit()?.name ?? null);
  readonly balance = signal<number | null>(null);
  readonly transactions = signal<EggStockTransaction[]>([]);
  readonly meta = signal<PaginatedResponse<EggStockTransaction>['meta'] | null>(null);
  readonly state = signal<LoadState>('idle');
  readonly mutation = signal<MutationState>('idle');
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canMove = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.move') === true);
  readonly canAdjust = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.adjust') === true);
  readonly activeAction = signal<'count' | 'receipt' | 'issue'>('count');
  readonly physicalCountForm = new FormGroup({
    counted_quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(0|[1-9]\d*)$/), Validators.max(2147483647)] }),
    occurred_at: new FormControl(localDate(), { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
  });
  private readonly countedQuantity = toSignal(this.physicalCountForm.controls.counted_quantity.valueChanges, { initialValue: this.physicalCountForm.controls.counted_quantity.value });
  readonly countDifference = computed(() => {
    const balance = this.balance();
    const raw = this.countedQuantity();
    if (balance === null || !/^(0|[1-9]\d*)$/.test(raw)) return null;
    const counted = Number(raw);
    return Number.isSafeInteger(counted) && counted <= 2147483647 ? counted - balance : null;
  });
  readonly receiptForm = new FormGroup({ quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)] }), occurred_at: new FormControl('', { nonNullable: true }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  readonly issueForm = new FormGroup({ quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)] }), type: new FormControl<'distribution_preparation' | 'loss'>('distribution_preparation', { nonNullable: true }), occurred_at: new FormControl('', { nonNullable: true }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  readonly filters = new FormGroup({ status: new FormControl('', { nonNullable: true }), type: new FormControl('', { nonNullable: true }), date_from: new FormControl('', { nonNullable: true }), date_to: new FormControl('', { nonNullable: true }) });
  private commandKey: string | null = null;
  private commandKind: 'receipt' | 'issue' | null = null;
  private physicalCountKey: string | null = null;
  private physicalCountFingerprint: string | null = null;
  private loadVersion = 0;
  private observedUnitId: number | null | undefined;

  constructor() {
    addIcons({
      'egg-outline': eggOutline,
      'calculator-outline': calculatorOutline,
      'add-circle-outline': addCircleOutline,
      'remove-circle-outline': removeCircleOutline,
      'time-outline': timeOutline,
    });
    if (!this.canAdjust() && this.canMove()) this.activeAction.set('receipt');
    effect(() => {
      const unitId = this.selectedUnit();
      if (unitId === this.observedUnitId) return;
      this.observedUnitId = unitId;
      this.resetForUnitChange();
      if (unitId !== null) void this.load();
    });
  }

  private resetForUnitChange(): void {
    this.loadVersion += 1;
    this.commandKey = null;
    this.commandKind = null;
    this.balance.set(null);
    this.transactions.set([]);
    this.meta.set(null);
    this.state.set('idle');
    this.mutation.set('idle');
    this.error.set(null);
    this.success.set(null);
    this.physicalCountKey = null;
    this.physicalCountFingerprint = null;
    this.physicalCountForm.reset({ counted_quantity: '', occurred_at: localDate(), reason: '' });
  }

  async load(page = 1): Promise<void> {
    const unit = this.selectedUnit();
    if (unit === null) return;
    const requestVersion = ++this.loadVersion;
    this.state.set('loading');
    this.error.set(null);
    try {
      const [balance, transactions] = await Promise.all([
        firstValueFrom(this.api.balance(unit)),
        firstValueFrom(this.api.movements(unit, this.filterValues(page))),
      ]);
      if (requestVersion !== this.loadVersion || unit !== this.selectedUnit()) return;
      this.balance.set(balance.data.balance);
      this.transactions.set(transactions.data);
      this.meta.set(transactions.meta);
      this.state.set(transactions.data.length ? 'success' : 'empty');
    } catch (error) {
      if (requestVersion !== this.loadVersion || unit !== this.selectedUnit()) return;
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo cargar el stock de huevos.'));
    }
  }

  clearFilters(): void {
    this.filters.reset({ status: '', type: '', date_from: '', date_to: '' });
    void this.load();
  }

  async submitReceipt(): Promise<void> {
    if (!this.selectedUnit() || this.receiptForm.invalid || this.mutation() === 'submitting') { this.receiptForm.markAllAsTouched(); return; }
    const value = this.receiptForm.getRawValue();
    await this.submitCommand('receipt', () => this.api.receipt(this.selectedUnit()!, { quantity: Number(value.quantity), occurred_at: value.occurred_at || undefined, reason: value.reason, notes: value.notes || undefined }, this.key('receipt')));
  }

  async submitIssue(): Promise<void> {
    if (!this.selectedUnit() || this.issueForm.invalid || this.mutation() === 'submitting') { this.issueForm.markAllAsTouched(); return; }
    const value = this.issueForm.getRawValue();
    await this.submitCommand('issue', () => this.api.issue(this.selectedUnit()!, { quantity: Number(value.quantity), type: value.type, occurred_at: value.occurred_at || undefined, reason: value.reason, notes: value.notes || undefined }, this.key('issue')));
  }

  async submitPhysicalCount(): Promise<void> {
    const unit = this.selectedUnit();
    const theoreticalBalance = this.balance();
    if (!unit || theoreticalBalance === null || this.state() === 'loading' || this.mutation() === 'submitting') return;
    if (this.physicalCountForm.invalid || this.countDifference() === null) {
      this.physicalCountForm.markAllAsTouched();
      return;
    }
    const value = this.physicalCountForm.getRawValue();
    const body: EggStockPhysicalCountInput = {
      counted_quantity: Number(value.counted_quantity),
      expected_balance: theoreticalBalance,
      reason: value.reason.trim(),
      occurred_at: value.occurred_at,
    };
    const fingerprint = JSON.stringify(body);
    if (this.physicalCountKey === null || this.physicalCountFingerprint !== fingerprint) {
      this.physicalCountKey = createIdempotencyKey();
      this.physicalCountFingerprint = fingerprint;
    }

    this.mutation.set('submitting');
    this.error.set(null);
    this.success.set(null);
    try {
      await firstValueFrom(this.api.physicalCount(unit, body, this.physicalCountKey));
      this.physicalCountKey = null;
      this.physicalCountFingerprint = null;
      this.mutation.set('success');
      this.success.set('Conteo físico registrado. El saldo y el historial se actualizaron.');
      this.physicalCountForm.reset({ counted_quantity: '', occurred_at: localDate(), reason: '' });
      await this.load(this.meta()?.current_page ?? 1);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        const message = inventoryErrorMessage(error, 'El saldo cambió mientras registrabas el conteo. Se actualizó el saldo actual.');
        await this.load(this.meta()?.current_page ?? 1);
        this.mutation.set('error');
        this.error.set(message);
        return;
      }
      this.mutation.set('error');
      applyInventoryValidationErrors(this.physicalCountForm, error);
      this.error.set(inventoryErrorMessage(error, 'No se pudo registrar el conteo físico. Intentá nuevamente.'));
    }
  }

  selectAction(action: 'count' | 'receipt' | 'issue'): void {
    if (action === 'count' ? !this.canAdjust() : !this.canMove()) return;
    this.activeAction.set(action);
    this.error.set(null);
    this.success.set(null);
  }
  cancelPhysicalCount(): void {
    this.physicalCountForm.reset({ counted_quantity: '', occurred_at: localDate(), reason: '' });
    this.error.set(null);
    this.success.set(null);
  }
  typeLabel(type: EggStockMovementType): string { return ({ collection_receipt: 'Ingreso de producción', manual_receipt: 'Ingreso manual', distribution_preparation: 'Preparación de reparto', loss: 'Pérdida', physical_count: 'Conteo físico' } satisfies Record<EggStockMovementType, string>)[type]; }
  statusLabel(status: EggStockStatus): string { return status === 'recorded' ? 'Registrado' : 'Cancelado'; }
  date(value: string): string { return new Intl.DateTimeFormat('es-UY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  movementDate(item: EggStockTransaction): string { return item.type === 'physical_count' ? countDate(item.occurred_at) : this.date(item.occurred_at); }
  quantity(value: number): string { return `${formatQuantity(String(value))} huevos`; }
  countedQuantityValue(): number { return Number(this.physicalCountForm.controls.counted_quantity.value) || 0; }
  signedDifference(value: number): string {
    if (value === 0) return this.quantity(0);
    return `${value > 0 ? '+' : '−'}${this.quantity(Math.abs(value))}`;
  }
  countExplanation(value: number): string {
    if (value === 0) return 'El saldo coincide con la cantidad contada.';
    return value > 0
      ? `Se sumarán ${this.quantity(value)} al saldo para que coincida.`
      : `Se descontarán ${this.quantity(Math.abs(value))} para que el saldo coincida.`;
  }
  differenceLabel(value: number): string {
    if (value === 0) return `Sin diferencia · ${this.quantity(0)}`;
    return `${value > 0 ? 'Sobrante' : 'Faltante'} · ${value > 0 ? '+' : '−'}${this.quantity(Math.abs(value))}`;
  }
  movementQuantity(item: EggStockTransaction): string {
    return item.type === 'physical_count' && item.difference !== undefined
      ? this.differenceLabel(item.difference)
      : this.quantity(item.quantity);
  }
  movementActor(item: EggStockTransaction): string {
    if (item.actor?.name.trim()) return item.actor.name;
    if (item.actor) return `ID ${item.actor.id}`;
    return 'Actor no informado';
  }
  movementDirection(item: EggStockTransaction): 'positive' | 'negative' | 'neutral' {
    if (item.type === 'physical_count' && item.difference !== undefined) {
      return item.difference > 0 ? 'positive' : item.difference < 0 ? 'negative' : 'neutral';
    }
    if (item.type === 'collection_receipt' || item.type === 'manual_receipt') return 'positive';
    return 'negative';
  }
  isCorrected(item: EggStockTransaction): boolean {
    return item.revisions?.some((revision) => revision.action === 'correct') ?? false;
  }
  signedMovementQuantity(item: EggStockTransaction): string {
    if (item.type === 'physical_count' && item.difference !== undefined) return this.differenceLabel(item.difference);
    return `${this.movementDirection(item) === 'positive' ? '+' : '−'}${this.quantity(item.quantity)}`;
  }

  private async submitCommand(kind: 'receipt' | 'issue', request: () => ReturnType<EggStockApi['receipt']>): Promise<void> {
    this.mutation.set('submitting');
    this.error.set(null);
    this.success.set(null);
    this.commandKind = kind;
    try {
      await firstValueFrom(request());
      this.mutation.set('success');
      this.success.set(kind === 'receipt' ? 'Ingreso de huevos registrado.' : 'Movimiento de huevos registrado.');
      this.commandKey = null;
      this.commandKind = null;
      if (kind === 'receipt') this.receiptForm.reset(); else this.issueForm.reset({ type: 'distribution_preparation', quantity: '', occurred_at: '', reason: '', notes: '' });
      await this.load(this.meta()?.current_page ?? 1);
    } catch (error) {
      this.mutation.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo registrar el movimiento de huevos. Intentá nuevamente.'));
    }
  }

  private key(kind: 'receipt' | 'issue'): string {
    if (this.commandKind !== kind || this.commandKey === null) { this.commandKey = createIdempotencyKey(); this.commandKind = kind; }
    return this.commandKey!;
  }

  private filterValues(page: number): EggStockFilters {
    const value = this.filters.getRawValue();
    return { status: (value.status || undefined) as EggStockStatus | undefined, type: (value.type || undefined) as EggStockMovementType | undefined, date_from: value.date_from || undefined, date_to: value.date_to || undefined, per_page: 25, page };
  }
}

function localDate(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function countDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium' }).format(new Date(value));
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium' })
    .format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
