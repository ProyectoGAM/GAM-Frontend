import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import { createIdempotencyKey } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { InventoryOperation, MutationState } from '../../types/inventory-state.type';
import { Product, ReferenceOptions } from '../../interfaces/inventory';

interface LineControls {
  product_id: FormControl<string>;
  stock_location_id: FormControl<string>;
  to_stock_location_id: FormControl<string>;
  quantity: FormControl<string>;
  counted_quantity: FormControl<string>;
}

@Component({
  selector: 'app-inventory-movement-form',
  templateUrl: './movement-form.page.html',
  styleUrl: './movement-form.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class MovementFormPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(InventoryApi);
  private readonly references = inject(InventoryReferenceApi);
  readonly operation = signal<InventoryOperation>('receipt');
  readonly options = signal<ReferenceOptions | null>(null);
  readonly stockProducts = signal<Product[]>([]);
  readonly mutation = signal<MutationState>('idle');
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canMove = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.move') === true);
  readonly canAdjust = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  readonly lines = new FormArray<FormGroup<LineControls>>([this.newLine()]);
  readonly form = new FormGroup({
    supplier_id: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    occurred_at: new FormControl('', { nonNullable: true }),
    reference_type: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    reference_id: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    lines: this.lines,
  });
  private operationKey: string | null = null;

  constructor() {
    void this.loadReferences();
  }

  async loadReferences(): Promise<void> {
    try {
      const options = (await firstValueFrom(this.references.options())).data;
      const products = await firstValueFrom(this.references.activeProducts());
      this.stockProducts.set(products.data.filter((product) => product.stock_tracked));
      this.options.set({ ...options, products: this.stockProducts().map((product) => ({ value: product.id, label: `${product.sku} — ${product.name}` })) });
    } catch (error) {
      this.error.set(inventoryErrorMessage(error, 'No se pudieron cargar los productos y ubicaciones.'));
    }
  }

  setOperation(operation: InventoryOperation): void {
    this.operation.set(operation);
    this.error.set(null);
    this.success.set(null);
    this.operationKey = null;
  }

  addLine(): void {
    if (this.lines.length < 100) this.lines.push(this.newLine());
  }

  removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }

  async submit(): Promise<void> {
    if (this.mutation() === 'submitting') return;
    if (!this.allowedOperation() || this.form.invalid || this.lines.invalid || !this.validateBusinessFields()) {
      this.form.markAllAsTouched();
      this.lines.markAllAsTouched();
      return;
    }
    this.mutation.set('submitting');
    this.error.set(null);
    this.success.set(null);
    this.operationKey ??= createIdempotencyKey();
    const values = this.form.getRawValue();
    const lineValues = this.lines.getRawValue();
    try {
      const operation = this.operation();
      if (operation === 'receipt') {
        await firstValueFrom(this.api.receive({
          supplier_id: Number(values.supplier_id),
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), stock_location_id: Number(line.stock_location_id), quantity: line.quantity })),
          occurred_at: values.occurred_at || undefined,
          reason: values.reason || undefined,
          reference_type: values.reference_type || undefined,
          reference_id: values.reference_id || undefined,
        }, this.operationKey));
      } else if (operation === 'issue') {
        await firstValueFrom(this.api.issue({
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), stock_location_id: Number(line.stock_location_id), quantity: line.quantity })),
          occurred_at: values.occurred_at || undefined, reason: values.reason || undefined,
          reference_type: values.reference_type || undefined, reference_id: values.reference_id || undefined,
        }, this.operationKey));
      } else if (operation === 'loss') {
        await firstValueFrom(this.api.loss({
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), stock_location_id: Number(line.stock_location_id), quantity: line.quantity })),
          occurred_at: values.occurred_at || undefined, reason: values.reason,
        }, this.operationKey));
      } else if (operation === 'adjustment') {
        await firstValueFrom(this.api.adjustment({
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), stock_location_id: Number(line.stock_location_id), counted_quantity: line.counted_quantity })),
          occurred_at: values.occurred_at || undefined, reason: values.reason,
        }, this.operationKey));
      } else {
        await firstValueFrom(this.api.transfer({
          lines: lineValues.map((line) => ({ product_id: Number(line.product_id), from_stock_location_id: Number(line.stock_location_id), to_stock_location_id: Number(line.to_stock_location_id), quantity: line.quantity })),
          occurred_at: values.occurred_at || undefined, reason: values.reason || undefined,
        }, this.operationKey));
      }
      this.mutation.set('success');
      this.success.set('Movimiento registrado correctamente.');
      this.operationKey = null;
      this.form.reset();
      this.lines.clear();
      this.lines.push(this.newLine());
    } catch (error) {
      this.mutation.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo registrar el movimiento. Puedes reintentar sin duplicarlo.'));
    }
  }

  operationLabel(): string {
    return ({ receipt: 'Ingreso', issue: 'Salida', loss: 'Pérdida', adjustment: 'Ajuste por conteo', transfer: 'Transferencia' } satisfies Record<InventoryOperation, string>)[this.operation()];
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

  private newLine(): FormGroup<LineControls> {
    return new FormGroup<LineControls>({
      product_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      stock_location_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      to_stock_location_id: new FormControl('', { nonNullable: true }),
      quantity: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^(?=.*[1-9])\d+(?:\.\d{1,6})?$/)] }),
      counted_quantity: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:\.\d{1,6})?$/)] }),
    });
  }
}
