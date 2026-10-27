import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { SuppliersApi } from '../../../suppliers-catalogs/suppliers/suppliers.api';
import { InventoryApi } from '../../services/inventory.api';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { AllowedStockProduct, AllowedStockProductFilters, PaginatedResponse, StockLocation } from '../../interfaces/inventory';
import { MovementFormPage } from './movement-form.page';

const product: AllowedStockProduct = { id: 4, sku: 'AL-4', name: 'Alimento', kind: 'supply', base_unit: 'kg', available_quantity: '10.000000' };
const doseProduct: AllowedStockProduct = { id: 5, sku: 'DOS-5', name: 'Dosis', kind: 'medicine', base_unit: 'dose', available_quantity: '12.000000' };
const rawProduct: AllowedStockProduct = { id: 6, sku: 'MP-6', name: 'Materia prima', kind: 'raw_material', base_unit: 'g', available_quantity: '1000.000000' };
const suppliers = [
  { id: 3, name: 'Proveedor activo', status: 'active' },
  { id: 4, name: 'Proveedor activo 2', status: 'active' },
  { id: 30, name: 'Proveedor inactivo', status: 'inactive' },
];
const stockLocations: StockLocation[] = [
  { id: 2, name: 'Depósito activo', system_managed: false, status: 'active' },
  { id: 9, name: 'Ubicación sin tipo en su nombre', system_managed: true, poultry_house_id: 3, production_unit: { id: 1, name: 'El Ombú' }, status: 'active' },
  { id: 20, name: 'Depósito inactivo', system_managed: false, status: 'inactive' },
];
const paginated = <T>(data: T[], page = 1, lastPage = 1): PaginatedResponse<T> => ({
  data, links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: page, from: data.length ? 1 : null, last_page: lastPage, per_page: 100, to: data.length || null, total: data.length },
});

describe('Location-first inventory movements', () => {
  let fixture: ComponentFixture<MovementFormPage>;
  let allowedProducts: ReturnType<typeof vi.fn>;
  let supplierList: ReturnType<typeof vi.fn>;
  let locationList: ReturnType<typeof vi.fn>;
  let receive: ReturnType<typeof vi.fn>;
  let issue: ReturnType<typeof vi.fn>;
  let loss: ReturnType<typeof vi.fn>;
  let adjustment: ReturnType<typeof vi.fn>;
  let transfer: ReturnType<typeof vi.fn>;

  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.referencesState()).not.toBe('loading');
      for (const state of fixture.componentInstance.productStates().values()) expect(state.status).not.toBe('loading');
    });
  };
  const createFixture = async (permissions = ['inventory.move', 'inventory.adjust']): Promise<void> => {
    allowedProducts = vi.fn((_filters: AllowedStockProductFilters) => of(paginated([product, doseProduct])));
    supplierList = vi.fn((filters: { status?: string }, page: number) => {
      const matching = suppliers.filter((item) => item.status === filters.status);
      return of(paginated(matching.slice(page - 1, page), page, matching.length));
    });
    locationList = vi.fn((filters: { status?: string; page?: number }) => {
      const matching = stockLocations.filter((item) => item.status === filters.status);
      const page = filters.page ?? 1;
      return of(paginated(matching.slice(page - 1, page), page, matching.length));
    });
    receive = vi.fn(() => of({ data: {} })); issue = vi.fn(() => of({ data: {} }));
    loss = vi.fn(() => of({ data: {} })); adjustment = vi.fn(() => of({ data: {} })); transfer = vi.fn(() => of({ data: {} }));
    await TestBed.configureTestingModule({ imports: [MovementFormPage], providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions }) } },
      { provide: InventoryApi, useValue: { allowedProducts, receive, issue, loss, adjustment, transfer } },
      { provide: SuppliersApi, useValue: { list: supplierList } },
      { provide: StockLocationsApi, useValue: { list: locationList } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(MovementFormPage);
    fixture.detectChanges();
    await settle();
  };
  const chooseSource = async (id = '2'): Promise<void> => {
    fixture.componentInstance.lines.at(0).controls.stock_location_id.setValue(id);
    await settle();
  };
  const completeReceipt = async (quantity = '1'): Promise<void> => {
    await chooseSource();
    const page = fixture.componentInstance;
    page.form.controls.supplier_id.setValue('3');
    page.lines.at(0).patchValue({ product_id: '4', quantity });
    fixture.detectChanges();
  };

  afterEach(() => fixture?.destroy());

  it('loads active locations and suppliers across pages without requesting products before a location is chosen', async () => {
    await createFixture();
    expect(supplierList).toHaveBeenCalledWith({ status: 'active', per_page: 100 }, 2);
    expect(locationList).toHaveBeenCalledWith({ status: 'active', per_page: 100, page: 2 });
    expect(allowedProducts).not.toHaveBeenCalled();
    expect((fixture.nativeElement.querySelector('#product-0') as HTMLInputElement).disabled).toBe(true);
    const inputs = [...fixture.nativeElement.querySelectorAll('.line input') as NodeListOf<HTMLInputElement>];
    expect(inputs[0].id).toBe('location-0');
    expect(inputs[1].id).toBe('product-0');
    const supplierLabels = [...fixture.nativeElement.querySelectorAll('#supplier option') as NodeListOf<HTMLOptionElement>].map((item) => item.textContent?.trim());
    expect(supplierLabels).toContain('Proveedor activo');
    expect(supplierLabels).not.toContain('Proveedor inactivo');
  });

  it('uses the new endpoint response as the product authority instead of inferring rules from location names or links', async () => {
    await createFixture();
    allowedProducts.mockReturnValue(of(paginated([rawProduct])));
    await chooseSource('9');
    expect(allowedProducts).toHaveBeenCalledWith({ stock_location_id: 9, operation: 'receipt', per_page: 100, page: 1 });
    expect(fixture.componentInstance.productStateFor(fixture.componentInstance.lines.at(0)).options).toEqual([{ value: 6, label: 'MP-6 — Materia prima' }]);
    expect(fixture.nativeElement.querySelector('#location-context-0')?.textContent).toBe('Planta de ración · El Ombú');
    allowedProducts.mockReturnValue(of(paginated([doseProduct])));
    await fixture.componentInstance.loadProductsFor(fixture.componentInstance.lines.at(0));
    fixture.detectChanges();
    expect(fixture.componentInstance.productStateFor(fixture.componentInstance.lines.at(0)).products).toEqual([doseProduct]);
  });

  it('selects product IDs through the searchable selector after the location has enabled it', async () => {
    await createFixture(); await chooseSource();
    const input = fixture.nativeElement.querySelector('#product-0') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    input.focus(); fixture.detectChanges();
    (fixture.nativeElement.querySelector('#product-0-listbox [role="option"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.lines.at(0).controls.product_id.value).toBe('4');
    expect(fixture.nativeElement.querySelector('.quantity-unit')?.textContent).toBe('kg');
  });

  it('collects every scoped page before enabling the complete product selector', async () => {
    await createFixture();
    allowedProducts.mockImplementation((filters: AllowedStockProductFilters) => of(paginated(filters.page === 1 ? [product] : [doseProduct], filters.page, 2)));
    await chooseSource();
    expect(allowedProducts).toHaveBeenLastCalledWith({ stock_location_id: 2, operation: 'receipt', per_page: 100, page: 2 });
    expect(fixture.componentInstance.productStateFor(fixture.componentInstance.lines.at(0)).products).toEqual([product, doseProduct]);
  });

  it('requeries on operation changes and losses show only the server list for that location', async () => {
    await createFixture(); await completeReceipt();
    allowedProducts.mockImplementation((filters: AllowedStockProductFilters) => of(paginated(filters.operation === 'loss' ? [doseProduct] : [product, doseProduct])));
    const page = fixture.componentInstance;
    page.setOperation('loss'); await settle();
    const line = page.lines.at(0);
    expect(allowedProducts).toHaveBeenLastCalledWith({ stock_location_id: 2, operation: 'loss', per_page: 100, page: 1 });
    expect(page.productStateFor(line).products).toEqual([doseProduct]);
    expect(line.controls.product_id.value).toBe('');
    expect(line.controls.quantity.value).toBe('');
    page.form.controls.supplier_id.setValue('');
    expect(page.form.controls.supplier_id.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('#supplier')).toBeNull();
  });

  it('explains empty loss stock and keeps the selector blocked', async () => {
    await createFixture();
    allowedProducts.mockReturnValue(of(paginated([])));
    fixture.componentInstance.setOperation('loss'); await chooseSource();
    const line = fixture.componentInstance.lines.at(0);
    expect(fixture.componentInstance.productStateFor(line).status).toBe('empty');
    expect(fixture.nativeElement.querySelector('#product-context-0')?.textContent).toContain('stock positivo');
    expect((fixture.nativeElement.querySelector('#product-0') as HTMLInputElement).disabled).toBe(true);
  });

  it('preserves a compatible selection but clears product and quantities when the next location rejects it', async () => {
    await createFixture(); await completeReceipt('12,500000');
    await chooseSource('9');
    const line = fixture.componentInstance.lines.at(0);
    expect(line.controls.product_id.value).toBe('4'); expect(line.controls.quantity.value).toBe('12,500000');
    allowedProducts.mockReturnValue(of(paginated([doseProduct])));
    await chooseSource('2');
    expect(line.controls.product_id.value).toBe(''); expect(line.controls.quantity.value).toBe('');
  });

  it('clears the dependent fields immediately when the source is cleared', async () => {
    await createFixture(); await completeReceipt(); await chooseSource('');
    const page = fixture.componentInstance; const line = page.lines.at(0);
    expect(line.controls.product_id.value).toBe(''); expect(line.controls.quantity.value).toBe('');
    expect(page.productStateFor(line).status).toBe('idle');
    expect((fixture.nativeElement.querySelector('#product-0') as HTMLInputElement).disabled).toBe(true);
  });

  it('ignores late responses from previous locations', async () => {
    await createFixture();
    const first = new Subject<PaginatedResponse<AllowedStockProduct>>();
    const second = new Subject<PaginatedResponse<AllowedStockProduct>>();
    allowedProducts.mockReturnValueOnce(first.asObservable()).mockReturnValueOnce(second.asObservable());
    const page = fixture.componentInstance; const line = page.lines.at(0);
    line.controls.stock_location_id.setValue('2'); line.controls.stock_location_id.setValue('9');
    second.next(paginated([rawProduct])); await settle();
    first.next(paginated([doseProduct])); await settle();
    expect(page.productStateFor(line).products).toEqual([rawProduct]);
  });

  it('ignores an old operation response and stops its remaining pagination', async () => {
    await createFixture();
    const previous = new Subject<PaginatedResponse<AllowedStockProduct>>();
    allowedProducts.mockReturnValueOnce(previous.asObservable()).mockReturnValue(of(paginated([doseProduct])));
    const page = fixture.componentInstance; const line = page.lines.at(0);
    line.controls.stock_location_id.setValue('2'); page.setOperation('loss'); await settle();
    previous.next(paginated([product], 1, 3)); await settle();
    expect(page.productStateFor(line).products).toEqual([doseProduct]);
    expect(allowedProducts.mock.calls.some(([filters]) => filters.operation === 'receipt' && filters.page === 2)).toBe(false);
  });

  it('does not restore options after a pending line is removed', async () => {
    await createFixture(); const page = fixture.componentInstance;
    page.addLine(); const removed = page.lines.at(1);
    const pending = new Subject<PaginatedResponse<AllowedStockProduct>>();
    allowedProducts.mockReturnValue(pending.asObservable());
    removed.controls.stock_location_id.setValue('2'); page.removeLine(1);
    pending.next(paginated([product])); await settle();
    expect(page.productStates().has(removed)).toBe(false); expect(page.lines.length).toBe(1);
    expect(document.activeElement?.id).toBe('location-0');
  });

  it('keeps errors local and retries without falling back to global catalogue products', async () => {
    await createFixture();
    allowedProducts.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    await chooseSource(); const page = fixture.componentInstance; const line = page.lines.at(0);
    expect(page.productStateFor(line).status).toBe('error'); expect(page.productStateFor(line).products).toEqual([]);
    expect((fixture.nativeElement.querySelector('#product-0') as HTMLInputElement).disabled).toBe(true);
    allowedProducts.mockReturnValue(of(paginated([doseProduct])));
    (fixture.nativeElement.querySelector('.product-field button') as HTMLButtonElement).click(); await settle();
    expect(page.productStateFor(line).products).toEqual([doseProduct]);
    expect(line.controls.stock_location_id.value).toBe('2');
  });

  it('blocks sending a previously selected product while its new compatibility is loading', async () => {
    await createFixture(); await completeReceipt();
    const pending = new Subject<PaginatedResponse<AllowedStockProduct>>(); allowedProducts.mockReturnValue(pending.asObservable());
    const page = fixture.componentInstance; page.lines.at(0).controls.stock_location_id.setValue('9');
    await page.submit(); fixture.detectChanges();
    expect(receive).not.toHaveBeenCalled(); expect(page.error()).toContain('Espera');
    pending.next(paginated([product])); await settle();
  });

  it('rejects a product ID injected into the form but absent from the current endpoint response', async () => {
    await createFixture(); await completeReceipt();
    const page = fixture.componentInstance; page.lines.at(0).controls.product_id.setValue('999');
    await page.submit(); expect(receive).not.toHaveBeenCalled(); expect(page.error()).toContain('permitidos');
  });

  it('requires both transfer locations, intersects their paginated lists and uses the source balance', async () => {
    await createFixture(); const page = fixture.componentInstance; page.setOperation('transfer');
    await chooseSource(); expect(allowedProducts).not.toHaveBeenCalled();
    allowedProducts.mockImplementation((filters: AllowedStockProductFilters) => of(paginated(filters.stock_location_id === 2 ? [product, doseProduct] : [{ ...doseProduct, available_quantity: '300.000000' }, rawProduct])));
    const line = page.lines.at(0); line.controls.to_stock_location_id.setValue('9'); await settle();
    expect(allowedProducts).toHaveBeenCalledWith({ stock_location_id: 2, operation: 'transfer', per_page: 100, page: 1 });
    expect(allowedProducts).toHaveBeenCalledWith({ stock_location_id: 9, operation: 'transfer', per_page: 100, page: 1 });
    expect(page.productStateFor(line).products).toEqual([doseProduct]);
    line.patchValue({ product_id: '5', quantity: '2' });
    expect(page.productHintFor(line)).toContain('12 dosis');
    await page.submit();
    expect(transfer.mock.calls[0][0].lines).toEqual([{ product_id: 5, from_stock_location_id: 2, to_stock_location_id: 9, quantity: '2' }]);
  });

  it('clears an incompatible transfer selection when only the destination changes', async () => {
    await createFixture(); const page = fixture.componentInstance; page.setOperation('transfer');
    const line = page.lines.at(0); line.controls.stock_location_id.setValue('2'); line.controls.to_stock_location_id.setValue('9'); await settle();
    line.patchValue({ product_id: '4', quantity: '1' });
    allowedProducts.mockReturnValue(of(paginated([]))); line.controls.to_stock_location_id.setValue('2'); await settle();
    expect(line.controls.product_id.value).toBe(''); expect(page.productHintFor(line)).toContain('distintas');
    await page.submit(); expect(transfer).not.toHaveBeenCalled();
  });

  it('shows an empty transfer intersection rather than products accepted by only one endpoint', async () => {
    await createFixture(); const page = fixture.componentInstance; page.setOperation('transfer');
    allowedProducts.mockImplementation((filters: AllowedStockProductFilters) => of(paginated(filters.stock_location_id === 2 ? [product] : [rawProduct])));
    const line = page.lines.at(0); line.controls.stock_location_id.setValue('2'); line.controls.to_stock_location_id.setValue('9'); await settle();
    expect(page.productStateFor(line).status).toBe('empty'); expect(page.productStateFor(line).products).toEqual([]);
  });

  it('renders exact counted-minus-registered differences from the endpoint without a separate balance request', async () => {
    await createFixture(); const page = fixture.componentInstance; page.setOperation('adjustment');
    allowedProducts.mockReturnValue(of(paginated([{ ...product, available_quantity: '9007199254740993.000001' }])));
    await chooseSource(); const line = page.lines.at(0); line.controls.product_id.setValue('4');
    line.controls.counted_quantity.setValue('9007199254740993,000003'); fixture.detectChanges();
    expect(page.registeredQuantityFor(line)).toBe('9.007.199.254.740.993,000001 kg');
    expect(page.differenceFor(line)).toBe('+0,000002 kg');
    expect(fixture.nativeElement.querySelector('.adjustment-summary')?.textContent).toContain('+0,000002 kg');
  });

  it('supports an explicit zero count, signed differences and the existing counted quantity payload', async () => {
    await createFixture(); const page = fixture.componentInstance; page.setOperation('adjustment'); await chooseSource();
    const line = page.lines.at(0); line.controls.product_id.setValue('4'); page.form.controls.reason.setValue('Conteo físico');
    for (const [count, difference] of [['20', '+10 kg'], ['10', '0 kg'], ['0', '-10 kg']]) {
      line.controls.counted_quantity.setValue(count); fixture.detectChanges();
      expect(page.differenceFor(line)).toBe(difference);
    }
    await page.submit(); expect(adjustment.mock.calls[0][0].lines[0].counted_quantity).toBe('0');
  });

  it('accepts a zero stock snapshot for a permitted product without an existing stock account', async () => {
    await createFixture(); const page = fixture.componentInstance; page.setOperation('adjustment');
    allowedProducts.mockReturnValue(of(paginated([{ ...product, available_quantity: '0.000000' }])));
    await chooseSource(); const line = page.lines.at(0); line.controls.product_id.setValue('4'); line.controls.counted_quantity.setValue('2');
    expect(page.registeredQuantityFor(line)).toBe('0 kg'); expect(page.differenceFor(line)).toBe('+2 kg');
  });

  it('keeps multiple lines and their local stock snapshots independent', async () => {
    await createFixture(); const page = fixture.componentInstance; page.setOperation('adjustment'); page.addLine();
    allowedProducts.mockImplementation((filters: AllowedStockProductFilters) => of(paginated([{ ...product, available_quantity: filters.stock_location_id === 2 ? '3.000000' : '8.000000' }])));
    page.lines.at(0).controls.stock_location_id.setValue('2'); page.lines.at(1).controls.stock_location_id.setValue('9'); await settle();
    page.lines.controls.forEach((line) => line.patchValue({ product_id: '4', counted_quantity: '4' })); fixture.detectChanges();
    const summaries = [...fixture.nativeElement.querySelectorAll('.adjustment-summary') as NodeListOf<HTMLElement>];
    expect(summaries[0].textContent).toContain('+1 kg'); expect(summaries[1].textContent).toContain('-4 kg');
  });

  it('updates the keypad and validators for discrete units while preserving decimal payload precision', async () => {
    await createFixture(); await completeReceipt('12,500000'); const page = fixture.componentInstance;
    await page.submit(); expect(receive.mock.calls[0][0].lines[0].quantity).toBe('12.500000');
    await chooseSource(); const current = page.lines.at(0); current.controls.product_id.setValue('5'); current.controls.quantity.setValue('1,5');
    expect(page.quantityInputModeFor(current)).toBe('numeric'); expect(current.controls.quantity.invalid).toBe(true);
    current.controls.quantity.setValue('2'); expect(current.controls.quantity.valid).toBe(true);
  });

  it('keeps supplier and reason requirements and the existing submit-error presentation', async () => {
    await createFixture(); await chooseSource(); const page = fixture.componentInstance; const line = page.lines.at(0);
    line.patchValue({ product_id: '4', quantity: '1' }); await page.submit(); fixture.detectChanges();
    expect(receive).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('#supplier-error')).not.toBeNull();
    page.form.controls.supplier_id.setValue('3'); receive.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'La ubicación está inactiva.' } })));
    await page.submit(); fixture.detectChanges(); expect(page.error()).toBe('La ubicación está inactiva.');
    page.setOperation('loss'); await settle(); page.form.controls.reason.setValue('   '); await page.submit(); fixture.detectChanges();
    expect(loss).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('#reason-error')).not.toBeNull();
  });

  it('keeps inline errors and ARIA descriptions aligned without showing pristine quantity errors', async () => {
    await createFixture(); await chooseSource(); const page = fixture.componentInstance; const line = page.lines.at(0); line.controls.product_id.setValue('4'); fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#quantity-0') as HTMLInputElement;
    input.focus(); input.blur(); fixture.detectChanges(); expect(input.getAttribute('aria-invalid')).toBeNull();
    input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); fixture.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('true'); expect(input.getAttribute('aria-describedby')).toBe('quantity-error-0');
    expect(fixture.nativeElement.querySelector('#quantity-error-0')).not.toBeNull();
  });

  it('limits operation selectors to permissions and keeps mobile and desktop selections synchronized', async () => {
    await createFixture(['inventory.adjust']); const page = fixture.componentInstance;
    const selector = fixture.nativeElement.querySelector('#movement-operation') as HTMLSelectElement;
    expect([...selector.options].map((option) => option.value)).toEqual(['loss', 'adjustment']); expect(selector.value).toBe('adjustment');
    page.selectOperation('receipt'); expect(page.operation()).toBe('adjustment');
    selector.value = 'loss'; selector.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.operation-tabs [aria-pressed="true"]')?.textContent).toContain('Pérdida');
  });

  it('locks editing, line and operation changes, return navigation and duplicate submission while saving', async () => {
    await createFixture(); await completeReceipt(); const pending = new Subject<{ data: object }>(); receive.mockReturnValue(pending.asObservable());
    const page = fixture.componentInstance; const submission = page.submit(); fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.form-fields') as HTMLFieldSetElement).disabled).toBe(true);
    expect((fixture.nativeElement.querySelector('#product-0') as HTMLInputElement).disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.back').getAttribute('href')).toBeNull();
    page.addLine(); page.removeLine(0); page.setOperation('loss'); await page.submit();
    expect(page.lines.length).toBe(1); expect(page.operation()).toBe('receipt'); expect(receive).toHaveBeenCalledTimes(1);
    pending.error(new HttpErrorResponse({ status: 503 })); await submission; fixture.detectChanges();
    expect(page.lines.at(0).controls.quantity.value).toBe('1'); expect(page.mutation()).toBe('error');
  });

  it('retains the idempotency key for an uncertain retry of the same operation', async () => {
    await createFixture(); await completeReceipt(); receive.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    const page = fixture.componentInstance; await page.submit(); const key = receive.mock.calls[0][1];
    page.setOperation('receipt'); await page.submit(); expect(receive.mock.calls[1][1]).toBe(key);
  });
});
