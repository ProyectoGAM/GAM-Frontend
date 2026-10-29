import { Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, merge } from 'rxjs';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, arrowDownOutline, arrowUpOutline, chevronForwardOutline, closeOutline, eggOutline, informationCircleOutline, optionsOutline } from 'ionicons/icons';

import { AuthStore } from '../../../../core/auth/auth.store';
import { ProductionUnit } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { EggStockApi } from '../../services/egg-stock.api';
import { createIdempotencyKey, formatQuantity } from '../../services/inventory-format';
import { applyInventoryValidationErrors, inventoryErrorMessage } from '../../services/inventory-errors';
import { EggStockFilters, EggStockStatus, EggStockTransaction, EggStockMovementType, PaginatedResponse } from '../../interfaces/inventory';
import { LoadState, MutationState } from '../../types/inventory-state.type';

const MOVEMENT_LABELS: Record<EggStockMovementType, string> = {
  collection_receipt: 'Ingreso de producción', manual_receipt: 'Ingreso manual',
  distribution_preparation: 'Preparación de reparto', loss: 'Pérdida',
  donation: 'Donación', distribution_return: 'Retorno de reparto',
};
const MOVEMENT_INCOMING: Record<EggStockMovementType, boolean> = {
  collection_receipt: true, manual_receipt: true, distribution_return: true,
  distribution_preparation: false, loss: false, donation: false,
};
const DATE_FORMAT = new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium' });
const TIME_FORMAT = new Intl.DateTimeFormat('es-UY', { timeStyle: 'short' });

@Component({
  selector: 'app-inventory-egg-stock',
  templateUrl: './egg-stock.page.html',
  styleUrl: './egg-stock.page.scss',
  imports: [ReactiveFormsModule, RouterLink, IonIcon],
})
export class EggStockPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(EggStockApi);
  private readonly route = inject(ActivatedRoute);
  private readonly requestedUnit = this.route.snapshot.queryParamMap.get('production_unit_id');
  readonly fromDonations = this.route.snapshot.queryParamMap.get('from') === 'donaciones';
  readonly backLink = this.fromDonations ? '/administracion/inventario/donaciones' : '/administracion/inventario/existencias';
  readonly backLabel = this.fromDonations ? 'Volver a donaciones' : 'Volver a existencias';
  private readonly productionUnitsApi = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly selectedUnit = signal<number | null>(null);
  readonly productionUnits = signal<ProductionUnit[]>([]);
  readonly productionUnitsState = signal<LoadState>('idle');
  readonly productionUnitsError = signal<string | null>(null);
  readonly balance = signal<number | null>(null);
  readonly balanceQuantity = computed(() => formatQuantity(String(this.balance() ?? 0)));
  readonly transactions = signal<EggStockTransaction[]>([]);
  readonly meta = signal<PaginatedResponse<EggStockTransaction>['meta'] | null>(null);
  readonly state = signal<LoadState>('idle');
  readonly mutation = signal<MutationState>('idle');
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canMove = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.move') === true);
  readonly selectedUnitName = computed(() => this.productionUnits().find((unit) => unit.id === this.selectedUnit())?.name ?? '');
  readonly filtersOpen = signal(false);
  readonly filterError = signal<string | null>(null);
  readonly commandError = signal<string | null>(null);
  readonly appliedFilterCount = signal(0);
  readonly rows = computed(() => this.transactions().map((item) => {
    const incoming = MOVEMENT_INCOMING[item.type];
    const occurredAt = new Date(item.occurred_at);
    return {
      item, incoming, label: MOVEMENT_LABELS[item.type],
      date: DATE_FORMAT.format(occurredAt), time: TIME_FORMAT.format(occurredAt),
      amount: `${incoming ? '+' : '−'}${formatQuantity(String(item.quantity))}`,
      fromProduction: item.type === 'collection_receipt' || item.reference?.type === 'egg_collection',
      status: item.status === 'cancelled' ? 'Cancelado' : 'Registrado',
    };
  }));
  readonly activeOperation = signal<'receipt' | 'issue'>('receipt');
  readonly receiptForm = new FormGroup({ quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/), Validators.max(2147483647)] }), occurred_at: new FormControl('', { nonNullable: true }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  readonly issueForm = new FormGroup({ quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/), Validators.max(2147483647)] }), type: new FormControl<'distribution_preparation' | 'loss'>('distribution_preparation', { nonNullable: true }), occurred_at: new FormControl('', { nonNullable: true }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  readonly activeForm = computed(() => this.activeOperation() === 'receipt' ? this.receiptForm : this.issueForm);
  readonly filters = new FormGroup({ status: new FormControl('', { nonNullable: true }), type: new FormControl('', { nonNullable: true }), date_from: new FormControl('', { nonNullable: true }), date_to: new FormControl('', { nonNullable: true }) });
  private commandKey: string | null = null;
  private commandKind: 'receipt' | 'issue' | null = null;
  private appliedFilters: EggStockFilters = {};
  private loadVersion = 0;
  private returnFocusTo: HTMLElement | null = null;
  @ViewChild('movementDialog', { static: true }) private readonly movementDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('quantityInput', { static: true }) private readonly quantityInput!: ElementRef<HTMLInputElement>;

  constructor() {
    addIcons({ addOutline, arrowBackOutline, arrowDownOutline, arrowUpOutline, chevronForwardOutline, closeOutline, eggOutline, informationCircleOutline, optionsOutline });
    this.destroyRef.onDestroy(() => { this.loadVersion += 1; });
    merge(this.receiptForm.valueChanges, this.issueForm.valueChanges).pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.mutation() !== 'submitting') { this.commandKey = null; this.commandKind = null; }
    });
    void this.loadProductionUnits();
  }

  async loadProductionUnits(): Promise<void> {
    this.productionUnitsState.set('loading');
    this.productionUnitsError.set(null);
    try {
      const units = await firstValueFrom(this.productionUnitsApi.listAll());
      this.productionUnits.set(units);
      this.productionUnitsState.set(units.length ? 'success' : 'empty');
      const first = units.find((unit) => String(unit.id) === this.requestedUnit)?.id ?? units[0]?.id;
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
    if (this.mutation() === 'submitting') return;
    this.closeMovement();
    this.selectedUnit.set(value ? Number(value) : null);
    this.commandKey = null;
    this.commandKind = null;
    this.receiptForm.reset();
    this.issueForm.reset({ type: 'distribution_preparation' });
    this.balance.set(null);
    this.transactions.set([]);
    this.meta.set(null);
    this.success.set(null);
    await this.load();
  }

  async chooseUnitFromEvent(event: Event): Promise<void> {
    const target = event.target;
    if (target instanceof HTMLSelectElement) await this.chooseUnit(target.value);
  }

  async load(page = 1): Promise<void> {
    const version = ++this.loadVersion;
    const unit = this.selectedUnit();
    if (!unit) { this.state.set('idle'); return; }
    this.state.set('loading');
    this.error.set(null);
    try {
      const [balance, transactions] = await Promise.all([
        firstValueFrom(this.api.balance(unit)),
        firstValueFrom(this.api.movements(unit, this.filterValues(page))),
      ]);
      if (version !== this.loadVersion) return;
      this.balance.set(balance.data.balance);
      this.transactions.set(transactions.data);
      this.meta.set(transactions.meta);
      this.state.set(transactions.data.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.loadVersion) return;
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo cargar el stock de huevos.'));
    }
  }

  clearFilters(): void {
    this.filters.reset({ status: '', type: '', date_from: '', date_to: '' });
    this.appliedFilters = {};
    this.appliedFilterCount.set(0);
    this.filterError.set(null);
    void this.load();
  }

  applyFilters(): void {
    const value = this.filters.getRawValue();
    if (value.date_from && value.date_to && value.date_from > value.date_to) {
      this.filterError.set('La fecha desde debe ser anterior o igual a la fecha hasta.');
      return;
    }
    this.filterError.set(null);
    this.appliedFilters = {
      status: (value.status || undefined) as EggStockStatus | undefined,
      type: (value.type || undefined) as EggStockMovementType | undefined,
      date_from: value.date_from || undefined, date_to: value.date_to || undefined,
    };
    this.appliedFilterCount.set(Object.values(this.appliedFilters).filter(Boolean).length);
    void this.load();
  }

  openMovement(event: Event): void {
    if (!this.canMove() || !this.selectedUnit() || this.mutation() === 'submitting') return;
    this.returnFocusTo = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.commandError.set(null);
    this.success.set(null);
    this.movementDialog.nativeElement.showModal();
    this.quantityInput.nativeElement.focus();
  }

  closeMovement(): void {
    if (this.mutation() === 'submitting') return;
    const dialog = this.movementDialog.nativeElement;
    if (!dialog.open) return;
    dialog.close();
    if (this.returnFocusTo?.isConnected) this.returnFocusTo.focus();
    this.returnFocusTo = null;
  }

  onDialogCancel(event: Event): void { event.preventDefault(); this.closeMovement(); }

  submitMovement(): void {
    if (this.activeOperation() === 'receipt') void this.submitReceipt();
    else void this.submitIssue();
  }

  async submitReceipt(): Promise<void> {
    if (!this.canMove() || !this.selectedUnit() || this.receiptForm.invalid || this.mutation() === 'submitting') { this.receiptForm.markAllAsTouched(); return; }
    const value = this.receiptForm.getRawValue();
    await this.submitCommand('receipt', () => this.api.receipt(this.selectedUnit()!, { quantity: Number(value.quantity), occurred_at: value.occurred_at || undefined, reason: value.reason, notes: value.notes || undefined }, this.key('receipt')));
  }

  async submitIssue(): Promise<void> {
    if (!this.canMove() || !this.selectedUnit() || this.issueForm.invalid || this.mutation() === 'submitting') { this.issueForm.markAllAsTouched(); return; }
    const value = this.issueForm.getRawValue();
    await this.submitCommand('issue', () => this.api.issue(this.selectedUnit()!, { quantity: Number(value.quantity), type: value.type, occurred_at: value.occurred_at || undefined, reason: value.reason, notes: value.notes || undefined }, this.key('issue')));
  }

  selectOperation(operation: 'receipt' | 'issue'): void {
    if (this.mutation() === 'submitting') return;
    this.activeOperation.set(operation); this.commandError.set(null);
  }
  private async submitCommand(kind: 'receipt' | 'issue', request: () => ReturnType<EggStockApi['receipt']>): Promise<void> {
    this.mutation.set('submitting');
    this.commandError.set(null);
    this.success.set(null);
    try {
      await firstValueFrom(request());
      this.mutation.set('success');
      this.success.set(kind === 'receipt' ? 'Ingreso de huevos registrado.' : 'Movimiento de huevos registrado.');
      this.commandKey = null;
      this.commandKind = null;
      if (kind === 'receipt') this.receiptForm.reset(); else this.issueForm.reset({ type: 'distribution_preparation', quantity: '', occurred_at: '', reason: '', notes: '' });
      this.closeMovement();
      if (!this.destroyRef.destroyed) await this.load();
    } catch (error) {
      this.mutation.set('error');
      applyInventoryValidationErrors(kind === 'receipt' ? this.receiptForm : this.issueForm, error);
      this.commandError.set(inventoryErrorMessage(error, 'No se pudo registrar el movimiento de huevos. Intentá nuevamente.'));
    }
  }

  private key(kind: 'receipt' | 'issue'): string {
    if (this.commandKind !== kind || this.commandKey === null) { this.commandKey = createIdempotencyKey(); this.commandKind = kind; }
    return this.commandKey!;
  }

  private filterValues(page: number): EggStockFilters {
    return { ...this.appliedFilters, per_page: 25, page };
  }
}
