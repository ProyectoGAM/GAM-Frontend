import { afterNextRender, Component, DestroyRef, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, firstValueFrom, Subscription } from 'rxjs';
import { distinctUntilChanged, startWith } from 'rxjs/operators';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, arrowForwardOutline, checkmarkCircle, clipboardOutline, cubeOutline, informationCircleOutline, swapHorizontalOutline, trashOutline, warningOutline } from 'ionicons/icons';

import { AuthStore } from '../../../../core/auth/auth.store';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { SuppliersApi } from '../../../suppliers-catalogs/suppliers/suppliers.api';
import { InventoryApi } from '../../services/inventory.api';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { createIdempotencyKey, formatQuantity, isDiscreteUnit, unitLabel } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { InventoryOperation, LoadState, MutationState } from '../../types/inventory-state.type';
import { AllowedStockProduct, BaseUnit, OptionValue, ReferenceOptions, StockLocation } from '../../interfaces/inventory';
import { Supplier } from '../../../suppliers-catalogs/suppliers/suppliers.models';
import { isMovementProductAllowed, movementLocationDescription, movementLocationKind } from '../../services/movement-product-policy';

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

type MovementReferenceOptions = Pick<ReferenceOptions, 'suppliers' | 'stock_locations'>;

interface LineProductState {
  status: LoadState;
  products: readonly AllowedStockProduct[];
  options: readonly OptionValue[];
  byId?: ReadonlyMap<string, AllowedStockProduct>;
  error?: string;
}

const EMPTY_PRODUCT_STATE: LineProductState = { status: 'idle', products: [], options: [] };

const EMPTY_BALANCE_STATE: AdjustmentBalanceState = { status: 'idle' };

const OPERATIONS: readonly { value: InventoryOperation; label: string; title: string; description: string; action: string; icon: string; adjusts: boolean }[] = [
  { value: 'receipt', label: 'Ingreso', title: 'Ingreso de productos', description: 'Productos recibidos de un proveedor.', action: 'Registrar ingreso', icon: 'cube-outline', adjusts: false },
  { value: 'issue', label: 'Salida', title: 'Salida de productos', description: 'Registra productos que salen de una ubicación.', action: 'Registrar salida', icon: 'arrow-forward-outline', adjusts: false },
  { value: 'transfer', label: 'Transferencia', title: 'Transferencia entre ubicaciones', description: 'Mueve stock entre dos ubicaciones.', action: 'Registrar transferencia', icon: 'swap-horizontal-outline', adjusts: false },
  { value: 'loss', label: 'Pérdida', title: 'Pérdida de productos', description: 'Registra productos dañados o perdidos.', action: 'Registrar pérdida', icon: 'warning-outline', adjusts: true },
  { value: 'adjustment', label: 'Ajuste por conteo', title: 'Ajuste por conteo', description: 'Ingresa la cantidad que contaste físicamente.', action: 'Registrar ajuste', icon: 'clipboard-outline', adjusts: true },
];

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
  imports: [ReactiveFormsModule, RouterLink, SearchableSelectComponent, IonIcon],
  host: { '[style.--movement-keyboard-offset]': 'viewportBottom() + "px"' },
})
export class MovementFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private requestedProductId = this.route.snapshot.queryParamMap.get('product_id');
  readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(InventoryApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly stockLocationsApi = inject(StockLocationsApi);
  readonly canMove = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.move') === true);
  readonly canAdjust = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  readonly operation = signal<InventoryOperation>(this.canMove() ? 'receipt' : 'adjustment');
  readonly operations = computed(() => OPERATIONS.filter((item) => item.adjusts ? this.canAdjust() : this.canMove()));
  readonly selectedOperation = computed(() => OPERATIONS.find((item) => item.value === this.operation())!);
  readonly reasonRequired = computed(() => this.operation() === 'loss' || this.operation() === 'adjustment');
  readonly sourceLabel = computed(() => this.operation() === 'receipt' ? 'Ubicación de destino' : this.operation() === 'adjustment' ? 'Ubicación' : 'Ubicación de origen');
  readonly quantityLabel = computed(() => ({ receipt: 'Cantidad', issue: 'Cantidad a retirar', transfer: 'Cantidad a transferir', loss: 'Cantidad perdida', adjustment: 'Cantidad contada' })[this.operation()]);
  readonly viewportBottom = signal(0);
  readonly locationDescriptions = signal(new Map<string, string>());
  private readonly locationsById = signal(new Map<string, StockLocation>());
  readonly options = signal<MovementReferenceOptions | null>(null);
  readonly productStates = signal(new Map<FormGroup<LineControls>, LineProductState>());
  readonly requestedProductNotice = signal<string | null>(null);
  readonly referencesState = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  readonly referencesError = signal<string | null>(null);
  readonly supplierReferencesError = signal<string | null>(null);
  readonly mutation = signal<MutationState>('idle');
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly submitAttempted = signal(false);
  readonly lines = new FormArray<FormGroup<LineControls>>([this.newLine()]);
  readonly form = new FormGroup({
    supplier_id: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    occurred_at: new FormControl('', { nonNullable: true }),
    reference_type: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    reference_id: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    lines: this.lines,
  });
  readonly supplierSelection = toSignal(this.form.controls.supplier_id.valueChanges, { initialValue: '' });
  readonly supplierErrorVisible = computed(() => this.submitAttempted() && this.operation() === 'receipt'
    && !!this.supplierSelection() && !this.options()?.suppliers.some((item) => String(item.value) === this.supplierSelection()));
  private operationKey: string | null = null;
  private readonly productRequestTokens = new WeakMap<FormGroup<LineControls>, number>();
  private readonly lineSubscriptions = new WeakMap<FormGroup<LineControls>, Subscription>();
  private referencesVersion = 0;

  constructor() {
    addIcons({ addOutline, arrowBackOutline, arrowForwardOutline, checkmarkCircle, clipboardOutline, cubeOutline, informationCircleOutline, swapHorizontalOutline, trashOutline, warningOutline });
    const viewport = window.visualViewport;
    const updateViewport = () => this.viewportBottom.set(viewport && viewport.scale === 1
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0);
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    updateViewport();
    this.destroyRef.onDestroy(() => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
    });
    this.updateValidators();
    this.watchLine(this.lines.at(0));
    void this.loadReferences();
  }

  async loadReferences(): Promise<void> {
    const version = ++this.referencesVersion;
    this.referencesState.set('loading');
    this.referencesError.set(null);
    this.supplierReferencesError.set(null);
    try {
      const locationFilters = { status: 'active' as const, per_page: 100 };
      const [suppliers, locationResponse] = await Promise.all([
        this.readSupplierOptions(version),
        firstValueFrom(this.stockLocationsApi.list({ ...locationFilters, page: 1 })),
      ]);
      const stockLocations: StockLocation[] = [...locationResponse.data];
      for (let page = 2; page <= locationResponse.meta.last_page; page += 1) {
        const response = await firstValueFrom(this.stockLocationsApi.list({ ...locationFilters, page }));
        stockLocations.push(...response.data);
      }
      if (this.destroyRef.destroyed || version !== this.referencesVersion) return;
      this.updateValidators();
      this.locationsById.set(new Map(stockLocations.map((location) => [String(location.id), location])));
      this.locationDescriptions.set(new Map(stockLocations.map((location) => [String(location.id), movementLocationDescription(location)])));
      this.options.set({
        suppliers: suppliers.filter((supplier) => supplier.status === 'active').map((supplier) => ({ value: supplier.id, label: supplier.name })),
        stock_locations: stockLocations.map((location) => ({ value: location.id, label: location.name })),
      });
      this.referencesState.set(stockLocations.length ? 'success' : 'empty');
      this.lines.controls.forEach((line) => void this.loadProductsFor(line));
    } catch (error) {
      if (this.destroyRef.destroyed || version !== this.referencesVersion) return;
      this.referencesState.set('error');
      this.referencesError.set(inventoryErrorMessage(error, 'No se pudieron cargar los proveedores y ubicaciones.'));
    }
  }

  private async readSupplierOptions(version: number): Promise<Supplier[]> {
    try {
      const suppliers: Supplier[] = [];
      let lastPage = 1;
      for (let page = 1; page <= lastPage; page++) {
        if (this.destroyRef.destroyed || version !== this.referencesVersion) return [];
        const response = await firstValueFrom(this.suppliersApi.list({ status: 'active', per_page: 100 }, page));
        suppliers.push(...response.data); lastPage = response.meta.last_page;
      }
      return suppliers;
    } catch {
      if (!this.destroyRef.destroyed && version === this.referencesVersion) this.supplierReferencesError.set('No se pudieron cargar los proveedores. Puedes continuar sin seleccionar uno para usar el proveedor interno.');
      return [];
    }
  }

  setOperation(operation: InventoryOperation): void {
    if (operation === this.operation()) return;
    if (!OPERATIONS.some((item) => item.value === operation)) return;
    if ((operation === 'loss' || operation === 'adjustment') ? !this.canAdjust() : !this.canMove()) return;
    if (this.mutation() === 'submitting') return;
    this.operation.set(operation);
    this.error.set(null);
    this.success.set(null);
    this.operationKey = null;
    this.submitAttempted.set(false);
    this.form.markAsUntouched();
    this.lines.markAsUntouched();
    this.updateValidators();
    for (const line of this.lines.controls) void this.loadProductsFor(line);
  }

  addLine(): void {
    if (this.mutation() === 'submitting') return;
    if (this.lines.length < 100) {
      const line = this.newLine();
      this.lines.push(line);
      this.watchLine(line);
      this.updateValidators();
      this.focusAfterRender(`#location-${this.lines.length - 1}`);
    }
  }

  removeLine(index: number): void {
    if (this.mutation() === 'submitting') return;
    if (this.lines.length > 1) {
      const line = this.lines.at(index);
      this.lineSubscriptions.get(line)?.unsubscribe();
      this.invalidateProductRequest(line);
      this.productStates.update((states) => { const next = new Map(states); next.delete(line); return next; });
      this.lines.removeAt(index);
      this.focusAfterRender(`#location-${Math.max(0, index - 1)}`);
    }
  }

  async loadProductsFor(line: FormGroup<LineControls>): Promise<void> {
    if (this.mutation() === 'submitting') return;
    const token = this.invalidateProductRequest(line);
    const operation = this.operation();
    const source = line.controls.stock_location_id.value;
    const destination = operation === 'transfer' ? line.controls.to_stock_location_id.value : '';
    const context = this.productContext(line);
    const locations = this.options()?.stock_locations ?? [];
    const validSource = locations.some((item) => String(item.value) === source);
    const validDestination = operation !== 'transfer' || locations.some((item) => String(item.value) === destination);
    if (this.referencesState() !== 'success' || !validSource || !validDestination || source === destination) {
      this.setProductState(line, EMPTY_PRODUCT_STATE);
      this.clearProductSelection(line);
      return;
    }
    this.setProductState(line, { status: 'loading', products: [], options: [] });
    const isCurrent = () => !this.destroyRef.destroyed && this.lines.controls.includes(line)
      && this.referencesState() === 'success' && this.productRequestTokens.get(line) === token && this.productContext(line) === context;
    try {
      const [sourceProducts, destinationProducts] = await Promise.all([
        this.readAllowedProducts(Number(source), operation, isCurrent),
        destination ? this.readAllowedProducts(Number(destination), operation, isCurrent) : Promise.resolve(null),
      ]);
      if (!isCurrent()) return;
      const destinationUnits = destinationProducts && new Map(destinationProducts.map((product) => [product.id, product.base_unit]));
      const sourceLocation = this.locationsById().get(source)!;
      const destinationLocation = destination ? this.locationsById().get(destination) : null;
      const products = sourceProducts.filter((product) => isMovementProductAllowed(product, sourceLocation, operation)
        && (!destinationLocation || isMovementProductAllowed(product, destinationLocation, operation))
        && (!destinationUnits || destinationUnits.get(product.id) === product.base_unit));
      this.setProductState(line, {
        status: products.length ? 'success' : 'empty', products,
        byId: new Map(products.map((product) => [String(product.id), product])),
        options: products.map((product) => ({ value: product.id, label: `${product.sku} — ${product.name}` })),
      });
      if (!products.some((product) => String(product.id) === line.controls.product_id.value)) this.clearProductSelection(line);
      if (this.requestedProductId && this.lines.at(0) === line && operation === 'receipt' && !line.controls.product_id.value) {
        if (products.some((product) => String(product.id) === this.requestedProductId)) {
          line.controls.product_id.setValue(this.requestedProductId, { emitEvent: false });
          this.requestedProductId = null;
          this.requestedProductNotice.set(null);
        } else {
          this.requestedProductNotice.set('El producto elegido en el catálogo no está permitido en esta ubicación. Elige otra ubicación o producto.');
        }
      }
      this.updateValidators();
    } catch (error) {
      if (!isCurrent()) return;
      this.setProductState(line, { status: 'error', products: [], options: [], error: inventoryErrorMessage(error, 'No se pudieron consultar los productos permitidos. Reintenta para continuar.') });
    }
  }

  productStateFor(line: FormGroup<LineControls>): LineProductState {
    return this.productStates().get(line) ?? EMPTY_PRODUCT_STATE;
  }

  productHintFor(line: FormGroup<LineControls>): string {
    const state = this.productStateFor(line);
    if (state.status === 'loading') return 'Consultando productos permitidos…';
    if (state.status === 'error') return state.error!;
    if (state.status === 'empty') {
      const location = this.locationsById().get(line.controls.stock_location_id.value);
      const eggAccount = location && movementLocationKind(location) === 'egg_account';
      return this.operation() === 'loss'
        ? 'No hay productos compatibles con stock positivo en esta ubicación.'
        : eggAccount ? 'No hay huevos habilitados para esta operación. Los huevos de la cuenta se gestionan desde Stock de huevos.'
        : 'No hay productos permitidos para esta operación en las ubicaciones elegidas.';
    }
    if (state.status === 'idle') return this.operation() === 'transfer'
      ? 'Primero elige ubicaciones de origen y destino distintas.' : 'Primero selecciona una ubicación.';
    const product = this.selectedProductFor(line);
    return product ? `Stock en esta ubicación: ${formatQuantity(product.available_quantity, product.base_unit)}.` : 'Selecciona un producto permitido para esta ubicación.';
  }

  balanceStateFor(line: FormGroup<LineControls>): AdjustmentBalanceState {
    const state = this.productStateFor(line);
    if (state.status === 'loading') return { status: 'loading' };
    if (state.status === 'error') return { status: 'unavailable' };
    const product = this.selectedProductFor(line);
    return product ? { status: 'ready', availableQuantity: product.available_quantity, unit: product.base_unit } : EMPTY_BALANCE_STATE;
  }

  registeredQuantityFor(line: FormGroup<LineControls>): string | null {
    const state = this.balanceStateFor(line);
    return state.status === 'ready' ? formatQuantity(state.availableQuantity, unitLabel(state.unit)) : null;
  }

  differenceFor(line: FormGroup<LineControls>): string | null {
    const state = this.balanceStateFor(line);
    if (state.status !== 'ready' || line.controls.counted_quantity.invalid || line.controls.counted_quantity.value === '') return null;
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

  fieldErrorVisible(control: AbstractControl): boolean {
    return control.invalid && (this.submitAttempted() || (control.touched && control.dirty));
  }

  quantityNoticeFor(line: FormGroup<LineControls>): string | null {
    if (!this.selectedUnitFor(line) || !line.controls.stock_location_id.value || line.controls.quantity.invalid || !line.controls.quantity.value) return null;
    const amount = formatQuantity(this.quantityPayload(line.controls.quantity.value), this.selectedUnitFor(line)!);
    return this.operation() === 'loss' ? `Se descontarán ${amount} del stock.`
      : this.operation() === 'issue' ? `Se descontarán ${amount} de esta ubicación.` : null;
  }

  countedQuantityFor(line: FormGroup<LineControls>): string | null {
    return line.controls.counted_quantity.valid && line.controls.counted_quantity.value !== '' && this.selectedUnitFor(line)
      ? formatQuantity(this.quantityPayload(line.controls.counted_quantity.value), this.selectedUnitFor(line)!) : null;
  }

  selectOperation(value: string): void {
    const operation = this.operations().find((item) => item.value === value);
    if (operation) this.setOperation(operation.value);
  }

  async submit(): Promise<void> {
    if (this.mutation() === 'submitting') return;
    if (this.referencesState() !== 'success') {
      this.error.set('Carga nuevamente los productos y ubicaciones antes de registrar el movimiento.');
      return;
    }
    this.submitAttempted.set(true);
    this.error.set(null);
    if (!this.allowedOperation() || this.form.invalid || this.lines.invalid || !this.validateBusinessFields()) {
      this.form.markAllAsTouched();
      this.lines.markAllAsTouched();
      this.focusAfterRender(this.error() ? '.feedback.error' : '[aria-invalid="true"]');
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
          ...(values.supplier_id ? { supplier_id: Number(values.supplier_id) } : {}),
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
        this.lineSubscriptions.get(line)?.unsubscribe();
        this.invalidateProductRequest(line);
      }
      while (this.lines.length > 1) this.lines.removeAt(this.lines.length - 1);
      this.productStates.set(new Map());
      this.form.reset();
      this.submitAttempted.set(false);
      this.watchLine(this.lines.at(0));
      this.updateValidators();
      this.focusAfterRender('.feedback.success');
    } catch (error) {
      this.mutation.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo registrar el movimiento. Puedes reintentar sin duplicarlo.'));
      this.focusAfterRender('.feedback.error');
    }
  }

  operationLabel(): string {
    return this.selectedOperation().title;
  }

  operationDescription(): string {
    return this.selectedOperation().description;
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => {
      const element = this.host.nativeElement.querySelector<HTMLElement>(selector);
      element?.focus();
      element?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    }, { injector: this.injector });
  }

  private allowedOperation(): boolean {
    return this.operation() === 'loss' || this.operation() === 'adjustment' ? this.canAdjust() : this.canMove();
  }

  private validateBusinessFields(): boolean {
    const values = this.form.getRawValue();
    if (this.supplierErrorVisible()) {
      this.error.set('Selecciona un proveedor activo de la lista o deja el campo vacío para usar el proveedor interno.');
      return false;
    }
    if (['loss', 'adjustment'].includes(this.operation()) && !values.reason.trim()) {
      this.error.set('El motivo es obligatorio para pérdidas y ajustes.');
      return false;
    }
    const lines = this.lines.getRawValue();
    if (this.lines.controls.some((line) => this.productStateFor(line).status !== 'success' || !this.selectedProductFor(line))) {
      this.error.set('Elige productos permitidos para las ubicaciones y la operación actuales. Espera a que termine la consulta o reinténtala.');
      return false;
    }
    if (lines.some((line) => !line.product_id || !line.stock_location_id || (this.operation() === 'transfer' && !line.to_stock_location_id))) {
      this.error.set('Completa producto y ubicación en todas las líneas.');
      return false;
    }
    if (lines.some((line) => this.operation() === 'adjustment' ? line.counted_quantity === '' : !line.quantity)) {
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

  private watchLine(line: FormGroup<LineControls>): void {
    const subscriptions = new Subscription();
    subscriptions.add(combineLatest([
      line.controls.stock_location_id.valueChanges.pipe(startWith(line.controls.stock_location_id.value)),
      line.controls.to_stock_location_id.valueChanges.pipe(startWith(line.controls.to_stock_location_id.value)),
    ]).pipe(
      distinctUntilChanged((previous, current) => previous[0] === current[0] && previous[1] === current[1]),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      void this.loadProductsFor(line);
    }));
    subscriptions.add(line.controls.product_id.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateValidators();
      if (this.lines.at(0) === line && this.selectedProductFor(line)) {
        this.requestedProductId = null;
        this.requestedProductNotice.set(null);
      }
    }));
    this.lineSubscriptions.set(line, subscriptions);
  }

  private selectedProductFor(line: FormGroup<LineControls>): AllowedStockProduct | undefined {
    return this.productStateFor(line).byId?.get(line.controls.product_id.value);
  }

  private invalidateProductRequest(line: FormGroup<LineControls>): number {
    const token = (this.productRequestTokens.get(line) ?? 0) + 1;
    this.productRequestTokens.set(line, token);
    return token;
  }

  private productContext(line: FormGroup<LineControls>): string {
    return `${this.operation()}:${line.controls.stock_location_id.value}:${this.operation() === 'transfer' ? line.controls.to_stock_location_id.value : ''}`;
  }

  private setProductState(line: FormGroup<LineControls>, state: LineProductState): void {
    const next = new Map(this.productStates());
    next.set(line, state);
    this.productStates.set(next);
  }

  private clearProductSelection(line: FormGroup<LineControls>): void {
    line.controls.product_id.reset('', { emitEvent: false });
    line.controls.quantity.reset('', { emitEvent: false });
    line.controls.counted_quantity.reset('', { emitEvent: false });
  }

  private async readAllowedProducts(locationId: number, operation: InventoryOperation, isCurrent: () => boolean): Promise<AllowedStockProduct[]> {
    const products = new Map<number, AllowedStockProduct>();
    let lastPage = 1;
    for (let page = 1; page <= lastPage; page += 1) {
      if (!isCurrent()) return [];
      const response = await firstValueFrom(this.api.allowedProducts({ stock_location_id: locationId, operation, per_page: 100, page }));
      if (!isCurrent()) return [];
      response.data.forEach((product) => products.set(product.id, product));
      lastPage = response.meta.last_page;
    }
    return [...products.values()];
  }

  private updateValidators(): void {
    const operation = this.operation();
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
