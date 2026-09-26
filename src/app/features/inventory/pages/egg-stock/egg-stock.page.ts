import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { ProductionUnit } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { EggStockApi } from '../../services/egg-stock.api';
import { createIdempotencyKey, formatQuantity } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { EggStockFilters, EggStockStatus, EggStockTransaction, EggStockMovementType, PaginatedResponse } from '../../interfaces/inventory';
import { LoadState, MutationState } from '../../types/inventory-state.type';

@Component({
  selector: 'app-inventory-egg-stock',
  templateUrl: './egg-stock.page.html',
  styleUrl: './egg-stock.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class EggStockPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(EggStockApi);
  private readonly productionUnitsApi = inject(ProductionUnitsService);
  readonly selectedUnit = signal<number | null>(null);
  readonly productionUnits = signal<ProductionUnit[]>([]);
  readonly productionUnitsState = signal<LoadState>('idle');
  readonly productionUnitsError = signal<string | null>(null);
  readonly balance = signal<number | null>(null);
  readonly transactions = signal<EggStockTransaction[]>([]);
  readonly meta = signal<PaginatedResponse<EggStockTransaction>['meta'] | null>(null);
  readonly state = signal<LoadState>('idle');
  readonly mutation = signal<MutationState>('idle');
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canMove = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.move') === true);
  readonly canAdjust = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.adjust') === true);
  readonly activeOperation = signal<'receipt' | 'issue'>('receipt');
  readonly receiptForm = new FormGroup({ quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)] }), occurred_at: new FormControl('', { nonNullable: true }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  readonly issueForm = new FormGroup({ quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)] }), type: new FormControl<'distribution_preparation' | 'loss'>('distribution_preparation', { nonNullable: true }), occurred_at: new FormControl('', { nonNullable: true }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  readonly filters = new FormGroup({ status: new FormControl('', { nonNullable: true }), type: new FormControl('', { nonNullable: true }), date_from: new FormControl('', { nonNullable: true }), date_to: new FormControl('', { nonNullable: true }) });
  private commandKey: string | null = null;
  private commandKind: 'receipt' | 'issue' | null = null;

  constructor() { void this.loadProductionUnits(); }

  async loadProductionUnits(): Promise<void> {
    this.productionUnitsState.set('loading');
    this.productionUnitsError.set(null);
    try {
      const units = await firstValueFrom(this.productionUnitsApi.listAll());
      this.productionUnits.set(units);
      this.productionUnitsState.set(units.length ? 'success' : 'empty');
      const first = units[0]?.id;
      if (this.selectedUnit() === null && first !== undefined) {
        this.selectedUnit.set(first);
        await this.load();
      }
    } catch {
      // Keep any already loaded balance/history usable when refreshing the selector fails.
      this.productionUnitsState.set('error');
      this.productionUnitsError.set('No se pudieron cargar las unidades productivas. Intentá nuevamente.');
    }
  }

  async chooseUnit(value: string): Promise<void> {
    this.selectedUnit.set(value ? Number(value) : null);
    this.commandKey = null;
    await this.load();
  }

  async chooseUnitFromEvent(event: Event): Promise<void> {
    const target = event.target;
    if (target instanceof HTMLSelectElement) await this.chooseUnit(target.value);
  }

  async load(page = 1): Promise<void> {
    const unit = this.selectedUnit();
    if (!unit) return;
    this.state.set('loading');
    this.error.set(null);
    try {
      const [balance, transactions] = await Promise.all([
        firstValueFrom(this.api.balance(unit)),
        firstValueFrom(this.api.movements(unit, this.filterValues(page))),
      ]);
      this.balance.set(balance.data.balance);
      this.transactions.set(transactions.data);
      this.meta.set(transactions.meta);
      this.state.set(transactions.data.length ? 'success' : 'empty');
    } catch (error) {
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

  selectOperation(operation: 'receipt' | 'issue'): void { this.activeOperation.set(operation); this.error.set(null); this.success.set(null); }
  typeLabel(type: EggStockMovementType): string { return ({ collection_receipt: 'Ingreso de producción', manual_receipt: 'Ingreso manual', distribution_preparation: 'Preparación de reparto', loss: 'Pérdida' } satisfies Record<EggStockMovementType, string>)[type]; }
  statusLabel(status: EggStockStatus): string { return status === 'recorded' ? 'Registrado' : 'Cancelado'; }
  date(value: string): string { return new Intl.DateTimeFormat('es-UY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  quantity(value: number): string { return `${formatQuantity(String(value))} huevos`; }

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
