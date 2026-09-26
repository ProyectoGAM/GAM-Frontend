import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest, firstValueFrom } from 'rxjs';
import { distinctUntilChanged, startWith } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import { createIdempotencyKey, formatQuantity, isDiscreteUnit, unitLabel } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { InventoryOperation, MutationState } from '../../types/inventory-state.type';
import { BaseUnit, Product, ReferenceOptions } from '../../interfaces/inventory';

interface LineControls {
  product_id: FormControl<string>;
  stock_location_id: FormControl<string>;
  to_stock_location_id: FormControl<string>;
  quantity: FormControl<string>;
  counted_quantity: FormControl<string>;
}

type AdjustmentBalanceState =
  | { status: 'idle' | 'loading' | 'unavailable' }
  | { status: 'ready'; availableQuantity: string; unit: BaseUnit };

const EMPTY_BALANCE_STATE: AdjustmentBalanceState = { status: 'idle' };

function decimalDifference(left: string, right: string): string | null {
  const parse = (value: string): { negative: boolean; integer: string; fraction: string } | null => {
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
    return match ? { negative: match[1] === '-', integer: match[2], fraction: match[3] ?? '' } : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  const places = Math.max(a.fraction.length, b.fraction.length);
  const scale = 10n ** BigInt(places);
  const scaled = (value: NonNullable<typeof a>): bigint => {
    const magnitude = BigInt(value.integer) * scale + BigInt(value.fraction.padEnd(places, '0') || '0');
    return value.negative ? -magnitude : magnitude;
  };
  const difference = scaled(a) - scaled(b);
  const negative = difference < 0n;
  const digits = (negative ? -difference : difference).toString().padStart(places + 1, '0');
  const integer = places ? digits.slice(0, -places) : digits;
  const fraction = places ? digits.slice(-places).replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

@Component({
  selector: 'app-inventory-movement-form',
  templateUrl: './movement-form.page.html',
  styleUrl: './movement-form.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class MovementFormPage {
  readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(InventoryApi);
  private readonly references = inject(InventoryReferenceApi);
  readonly canMove = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.move') === true);
  readonly canAdjust = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  readonly operation = signal<InventoryOperation>(this.canMove() ? 'receipt' : 'adjustment');
  readonly options = signal<ReferenceOptions | null>(null);
  readonly stockProducts = signal<Product[]>([]);
  readonly referencesState = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  readonly referencesError = signal<string | null>(null);
  readonly mutation = signal<MutationState>('idle');
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly lines = new FormArray<FormGroup<LineControls>>([this.newLine()]);
  readonly balanceStates = signal(new Map<FormGroup<LineControls>, AdjustmentBalanceState>());
  readonly form = new FormGroup({
    supplier_id: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    occurred_at: new FormControl('', { nonNullable: true }),
    reference_type: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    reference_id: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    lines: this.lines,
  });
  private operationKey: string | null = null;
  private readonly balanceRequestTokens = new WeakMap<FormGroup<LineControls>, number>();
  private readonly balanceSubscriptions = new WeakMap<FormGroup<LineControls>, { unsubscribe(): void }>();

  constructor() {
    this.updateValidators();
    this.watchBalanceLine(this.lines.at(0));
    void this.loadReferences();
  }

  async loadReferences(): Promise<void> {
    this.referencesState.set('loading');
    this.referencesError.set(null);
    try {
      const [referenceResponse, productsResponse] = await Promise.all([
        firstValueFrom(this.references.options()),
        firstValueFrom(this.references.activeProducts()),
      ]);
      const options = referenceResponse.data;
      this.stockProducts.set(productsResponse.data.filter((product) => product.stock_tracked));
      this.updateValidators();
      this.options.set({ ...options, products: this.stockProducts().map((product) => ({ value: product.id, label: `${product.sku} — ${product.name}` })) });
      this.referencesState.set(this.stockProducts().length && options.stock_locations.length ? 'success' : 'empty');
      if (this.operation() === 'adjustment') this.lines.controls.forEach((line) => void this.loadAdjustmentBalance(line));
    } catch (error) {
      this.referencesState.set('error');
      this.referencesError.set(inventoryErrorMessage(error, 'No se pudieron cargar los productos y ubicaciones.'));
    }
  }

  setOperation(operation: InventoryOperation): void {
    if ((operation === 'loss' || operation === 'adjustment') ? !this.canAdjust() : !this.canMove()) return;
    if (this.mutation() === 'submitting') return;
    this.operation.set(operation);
    this.error.set(null);
    this.success.set(null);
    this.operationKey = null;
    this.form.markAsUntouched();
    this.lines.markAsUntouched();
    this.updateValidators();
    for (const line of this.lines.controls) void this.loadAdjustmentBalance(line);
  }

  addLine(): void {
    if (this.lines.length < 100) {
      const line = this.newLine();
      this.lines.push(line);
      this.watchBalanceLine(line);
      this.updateValidators();
    }
  }

  removeLine(index: number): void {
    if (this.lines.length > 1) {
      const line = this.lines.at(index);
      this.balanceSubscriptions.get(line)?.unsubscribe();
      this.invalidateBalanceRequest(line);
      this.setBalanceState(line, EMPTY_BALANCE_STATE);
      this.lines.removeAt(index);
    }
  }

  async loadAdjustmentBalance(line: FormGroup<LineControls>): Promise<void> {
    const token = this.nextBalanceRequestToken(line);
    if (this.operation() !== 'adjustment') {
      this.setBalanceState(line, EMPTY_BALANCE_STATE);
      return;
    }
    const productId = Number(line.controls.product_id.value);
    const locationId = Number(line.controls.stock_location_id.value);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(locationId) || locationId < 1) {
      this.setBalanceState(line, EMPTY_BALANCE_STATE);
      return;
    }
    const product = this.stockProducts().find((item) => item.id === productId);
    if (!product) {
      this.setBalanceState(line, { status: 'unavailable' });
      return;
    }

    this.setBalanceState(line, { status: 'loading' });
    try {
      const response = await firstValueFrom(this.api.balances({ product_id: productId, stock_location_id: locationId, per_page: 100, page: 1 }));
      if (!this.isCurrentBalanceRequest(line, token, productId, locationId)) return;
      const matches = response.data.filter((balance) => balance.product_id === productId && balance.stock_location_id === locationId);
      const balance = matches.length === 1 ? matches[0] : null;
      if (!balance
        || balance.product?.id !== productId
        || balance.stock_location?.id !== locationId
        || balance.product.base_unit !== product.base_unit
        || !/^[-+]?\d+(?:\.\d+)?$/.test(balance.available_quantity)) {
        this.setBalanceState(line, { status: 'unavailable' });
        return;
      }
      this.setBalanceState(line, { status: 'ready', availableQuantity: balance.available_quantity, unit: product.base_unit });
    } catch {
      if (this.isCurrentBalanceRequest(line, token, productId, locationId)) this.setBalanceState(line, { status: 'unavailable' });
    }
  }

  balanceStateFor(line: FormGroup<LineControls>): AdjustmentBalanceState { return this.balanceStates().get(line) ?? EMPTY_BALANCE_STATE; }

  registeredQuantityFor(line: FormGroup<LineControls>): string | null {
    const state = this.balanceStateFor(line);
    return state.status === 'ready' ? formatQuantity(state.availableQuantity, unitLabel(state.unit)) : null;
  }

  differenceFor(line: FormGroup<LineControls>): string | null {
    const state = this.balanceStateFor(line);
    if (state.status !== 'ready' || line.controls.counted_quantity.invalid || !line.controls.counted_quantity.value) return null;
    const counted = line.controls.counted_quantity.value.replace(',', '.');
    const difference = decimalDifference(counted, state.availableQuantity);
    if (difference === null) return null;
    const sign = difference === '0' || difference.startsWith('-') ? '' : '+';
    return `${sign}${formatQuantity(difference, unitLabel(state.unit))}`;
  }

  selectedUnitFor(line: FormGroup<LineControls>): string | null {
    const product = this.selectedProductFor(line);
    return product ? unitLabel(product.base_unit) : null;
  }

  isDiscreteUnitFor(line: FormGroup<LineControls>): boolean {
    return isDiscreteUnit(this.selectedProductFor(line)?.base_unit);
  }

  quantityInputModeFor(line: FormGroup<LineControls>): 'numeric' | 'decimal' {
    return this.isDiscreteUnitFor(line) ? 'numeric' : 'decimal';
  }

  async submit(): Promise<void> {
    if (this.mutation() === 'submitting') return;
    if (this.referencesState() !== 'success') {
      this.error.set('Carga nuevamente los productos y ubicaciones antes de registrar el movimiento.');
      return;
    }
    if (!this.allowedOperation() || this.form.invalid || this.lines.invalid || !this.validateBusinessFields()) {
      this.form.markAllAsTouched();
      this.lines.markAllAsTouched();
      return;
    }
    this.mutation.set('submitting');
    this.error.set(null);
    this.success.set(null);
    const operation = this.operation();
    this.operationKey ??= createIdempotencyKey();
    const values = this.form.getRawValue();
    const lineValues = this.lines.getRawValue();
    try {
      if (operation === 'receipt') {
        await firstValueFrom(this.api.receive({
          supplier_id: Number(values.supplier_id),
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), stock_location_id: Number(line.stock_location_id), quantity: this.quantityPayload(line.quantity) })),
          occurred_at: values.occurred_at || undefined,
          reason: values.reason || undefined,
          reference_type: values.reference_type || undefined,
          reference_id: values.reference_id || undefined,
        }, this.operationKey));
      } else if (operation === 'issue') {
        await firstValueFrom(this.api.issue({
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), stock_location_id: Number(line.stock_location_id), quantity: this.quantityPayload(line.quantity) })),
          occurred_at: values.occurred_at || undefined, reason: values.reason || undefined,
          reference_type: values.reference_type || undefined, reference_id: values.reference_id || undefined,
        }, this.operationKey));
      } else if (operation === 'loss') {
        await firstValueFrom(this.api.loss({
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), stock_location_id: Number(line.stock_location_id), quantity: this.quantityPayload(line.quantity) })),
          occurred_at: values.occurred_at || undefined, reason: values.reason,
        }, this.operationKey));
      } else if (operation === 'adjustment') {
        await firstValueFrom(this.api.adjustment({
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), stock_location_id: Number(line.stock_location_id), counted_quantity: this.quantityPayload(line.counted_quantity) })),
          occurred_at: values.occurred_at || undefined, reason: values.reason,
        }, this.operationKey));
      } else {
        await firstValueFrom(this.api.transfer({
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), from_stock_location_id: Number(line.stock_location_id), to_stock_location_id: Number(line.to_stock_location_id), quantity: this.quantityPayload(line.quantity) })),
          occurred_at: values.occurred_at || undefined, reason: values.reason || undefined,
        }, this.operationKey));
      }
      this.mutation.set('success');
      this.success.set('Movimiento registrado correctamente.');
      this.operationKey = null;
      for (const line of this.lines.controls) {
        this.balanceSubscriptions.get(line)?.unsubscribe();
        this.invalidateBalanceRequest(line);
      }
      this.lines.clear();
      this.form.reset();
      const line = this.newLine();
      this.lines.push(line);
      this.watchBalanceLine(line);
      this.updateValidators();
    } catch (error) {
      this.mutation.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo registrar el movimiento. Puedes reintentar sin duplicarlo.'));
    }
  }

  operationLabel(): string {
    return ({ receipt: 'Ingreso de productos', issue: 'Salida de productos', loss: 'Pérdida de productos', adjustment: 'Ajuste por conteo', transfer: 'Transferencia entre ubicaciones' } satisfies Record<InventoryOperation, string>)[this.operation()];
  }

  operationDescription(): string {
    return ({
      receipt: 'Anota los productos recibidos y quién los entregó.',
      issue: 'Registra los productos que salen de una ubicación.',
      loss: 'Registra una pérdida física de productos.',
      adjustment: 'Cuenta físicamente el stock e ingresa la cantidad contada.',
      transfer: 'Mueve productos desde una ubicación hacia otra.',
    } satisfies Record<InventoryOperation, string>)[this.operation()];
  }

  private allowedOperation(): boolean {
    return this.operation() === 'loss' || this.operation() === 'adjustment' ? this.canAdjust() : this.canMove();
  }

  private validateBusinessFields(): boolean {
    const values = this.form.getRawValue();
    if (this.operation() === 'receipt' && !values.supplier_id) {
      this.error.set('Selecciona un proveedor para registrar un ingreso.');
      return false;
    }
    if (['loss', 'adjustment'].includes(this.operation()) && !values.reason.trim()) {
      this.error.set('El motivo es obligatorio para pérdidas y ajustes.');
      return false;
    }
    const lines = this.lines.getRawValue();
    if (lines.some((line) => !line.product_id || !line.stock_location_id || (this.operation() === 'transfer' && !line.to_stock_location_id))) {
      this.error.set('Completa producto y ubicación en todas las líneas.');
      return false;
    }
    if (lines.some((line) => this.operation() === 'adjustment' ? !line.counted_quantity : !line.quantity)) {
      this.error.set(this.operation() === 'adjustment' ? 'Completa la cantidad contada en todas las líneas.' : 'Completa la cantidad en todas las líneas.');
      return false;
    }
    if (this.operation() === 'transfer' && lines.some((line) => line.stock_location_id === line.to_stock_location_id)) {
      this.error.set('El origen y destino de una transferencia deben ser distintos.');
      return false;
    }
    return true;
  }

  private quantityPayload(value: string): string { return value.trim().replace(',', '.'); }

  private watchBalanceLine(line: FormGroup<LineControls>): void {
    const subscription = combineLatest([
      line.controls.product_id.valueChanges.pipe(startWith(line.controls.product_id.value)),
      line.controls.stock_location_id.valueChanges.pipe(startWith(line.controls.stock_location_id.value)),
    ]).pipe(
      distinctUntilChanged((previous, current) => previous[0] === current[0] && previous[1] === current[1]),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.updateValidators();
      void this.loadAdjustmentBalance(line);
    });
    this.balanceSubscriptions.set(line, subscription);
  }

  private selectedProductFor(line: FormGroup<LineControls>): Product | undefined {
    return this.stockProducts().find((product) => String(product.id) === line.controls.product_id.value);
  }

  private nextBalanceRequestToken(line: FormGroup<LineControls>): number {
    const token = (this.balanceRequestTokens.get(line) ?? 0) + 1;
    this.balanceRequestTokens.set(line, token);
    return token;
  }

  private invalidateBalanceRequest(line: FormGroup<LineControls>): void { this.nextBalanceRequestToken(line); }

  private isCurrentBalanceRequest(line: FormGroup<LineControls>, token: number, productId: number, locationId: number): boolean {
    return this.balanceRequestTokens.get(line) === token
      && this.operation() === 'adjustment'
      && Number(line.controls.product_id.value) === productId
      && Number(line.controls.stock_location_id.value) === locationId;
  }

  private setBalanceState(line: FormGroup<LineControls>, state: AdjustmentBalanceState): void {
    const next = new Map(this.balanceStates());
    next.set(line, state);
    this.balanceStates.set(next);
  }

  private updateValidators(): void {
    const operation = this.operation();
    this.form.controls.supplier_id.setValidators(operation === 'receipt' ? Validators.required : null);
    this.form.controls.reason.setValidators(
      operation === 'loss' || operation === 'adjustment'
        ? [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]
        : Validators.maxLength(255),
    );
    this.form.controls.supplier_id.updateValueAndValidity({ emitEvent: false });
    this.form.controls.reason.updateValueAndValidity({ emitEvent: false });
    for (const line of this.lines.controls) {
      line.controls.to_stock_location_id.setValidators(operation === 'transfer' ? Validators.required : null);
      line.controls.quantity.setValidators(operation === 'adjustment' ? null : [
        Validators.required,
        Validators.pattern(this.isDiscreteUnitFor(line) ? /^(?=.*[1-9])\d+$/ : /^(?=.*[1-9])\d+(?:[.,]\d{1,6})?$/),
      ]);
      line.controls.counted_quantity.setValidators(operation === 'adjustment' ? [
        Validators.required,
        Validators.pattern(this.isDiscreteUnitFor(line) ? /^\d+$/ : /^\d+(?:[.,]\d{1,6})?$/),
      ] : null);
      line.controls.to_stock_location_id.updateValueAndValidity({ emitEvent: false });
      line.controls.quantity.updateValueAndValidity({ emitEvent: false });
      line.controls.counted_quantity.updateValueAndValidity({ emitEvent: false });
    }
  }

  private newLine(): FormGroup<LineControls> {
    return new FormGroup<LineControls>({
      product_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      stock_location_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      to_stock_location_id: new FormControl('', { nonNullable: true }),
      quantity: new FormControl('', { nonNullable: true }),
      counted_quantity: new FormControl('', { nonNullable: true }),
    });
  }
}
