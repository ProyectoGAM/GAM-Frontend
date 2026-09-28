import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { SuppliersApi } from '../../../suppliers-catalogs/suppliers/suppliers.api';
import { InventoryApi } from '../../services/inventory.api';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { PaginatedResponse, Product, StockBalance } from '../../interfaces/inventory';
import { MovementFormPage } from './movement-form.page';

const product: Product = {
  id: 4, sku: 'AL-4', name: 'Alimento', kind: 'supply', base_unit: 'kg', stock_tracked: true, status: 'active',
};
const doseProduct: Product = {
  id: 5, sku: 'DOS-5', name: 'Dosis', kind: 'medicine', base_unit: 'dose', stock_tracked: true, status: 'active',
};

const suppliers = [
  { id: 3, name: 'Proveedor activo', status: 'active' },
  { id: 4, name: 'Proveedor activo 2', status: 'active' },
  { id: 30, name: 'Proveedor inactivo', status: 'inactive' },
  { id: 40, name: 'Proveedor inactivo 2', status: 'inactive' },
];
const stockLocations = [
  { id: 2, name: 'Depósito activo', system_managed: false, status: 'active' },
  { id: 9, name: 'Depósito activo 2', system_managed: false, status: 'active' },
  { id: 20, name: 'Depósito inactivo', system_managed: false, status: 'inactive' },
  { id: 90, name: 'Depósito inactivo 2', system_managed: false, status: 'inactive' },
];

const paginated = <T>(data: T[], page: number, lastPage: number) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: page, from: data.length ? 1 : null, last_page: lastPage, per_page: 100, to: data.length || null, total: data.length },
});

const balancesResponse = (data: StockBalance[]): PaginatedResponse<StockBalance> => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: data.length ? 1 : null, last_page: 1, per_page: 100, to: data.length || null, total: data.length },
});

const balance = (locationId: number, availableQuantity: string): StockBalance => ({
  id: locationId,
  product_id: 4,
  stock_location_id: locationId,
  product,
  stock_location: { id: locationId, name: 'Depósito', system_managed: false, status: 'active' },
  available_quantity: availableQuantity,
  minimum_quantity: '0',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

describe('Inventory movement adjustment comparison', () => {
  let fixture: ComponentFixture<MovementFormPage>;
  let requests: Subject<PaginatedResponse<StockBalance>>[];
  let supplierList: ReturnType<typeof vi.fn>;
  let stockLocationList: ReturnType<typeof vi.fn>;
  let receiveMovement: ReturnType<typeof vi.fn>;
  let adjustMovement: ReturnType<typeof vi.fn>;

  const createFixture = async (permissions = ['inventory.adjust']): Promise<void> => {
    requests = [];
    supplierList = vi.fn().mockImplementation((filters: { status?: string }, page: number) => {
      const matching = filters.status === 'active' ? suppliers.filter((item) => item.status === 'active') : suppliers;
      return of(paginated(matching.slice(page - 1, page), page, matching.length));
    });
    stockLocationList = vi.fn().mockImplementation((filters: { status?: string; page?: number }) => {
      const page = filters.page ?? 1;
      const matching = filters.status === 'active' ? stockLocations.filter((item) => item.status === 'active') : stockLocations;
      return of(paginated(matching.slice(page - 1, page), page, matching.length));
    });
    receiveMovement = vi.fn().mockReturnValue(of({ data: {} }));
    adjustMovement = vi.fn().mockReturnValue(of({ data: {} }));
    const api = {
      receive: receiveMovement,
      adjustment: adjustMovement,
      balances: () => {
        const request = new Subject<PaginatedResponse<StockBalance>>();
        requests.push(request);
        return request.asObservable();
      },
    };
    await TestBed.configureTestingModule({
      imports: [MovementFormPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions }) } },
        { provide: InventoryApi, useValue: api },
        { provide: InventoryReferenceApi, useValue: {
          activeProducts: () => of({ data: [product, doseProduct], links: { first: null, last: null, prev: null, next: null }, meta: { current_page: 1, from: 1, last_page: 1, per_page: 100, to: 2, total: 2 } }),
        } },
        { provide: SuppliersApi, useValue: { list: supplierList } },
        { provide: StockLocationsApi, useValue: { list: stockLocationList } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MovementFormPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.loadReferences();
    fixture.detectChanges();
  };

  it('requests active supplier and location pages and displays only the returned active options', async () => {
    await createFixture(['inventory.move']);
    fixture.detectChanges();

    expect(supplierList).toHaveBeenCalledWith({ status: 'active', per_page: 100 }, 1);
    expect(supplierList).toHaveBeenCalledWith({ status: 'active', per_page: 100 }, 2);
    expect(stockLocationList).toHaveBeenCalledWith({ status: 'active', per_page: 100, page: 1 });
    expect(stockLocationList).toHaveBeenCalledWith({ status: 'active', per_page: 100, page: 2 });

    const supplierLabels = [...fixture.nativeElement.querySelectorAll('#supplier option') as NodeListOf<HTMLOptionElement>]
      .map((option) => option.textContent?.trim());
    const locationLabels = [...fixture.nativeElement.querySelectorAll('#location-0 option') as NodeListOf<HTMLOptionElement>]
      .map((option) => option.textContent?.trim());
    expect(supplierLabels).toContain('Proveedor activo');
    expect(supplierLabels).not.toContain('Proveedor inactivo');
    expect(locationLabels).toContain('Depósito activo');
    expect(locationLabels).not.toContain('Depósito inactivo');
    fixture.destroy();
  });

  it('uses the loaded active locations for every operation and both transfer selects', async () => {
    await createFixture(['inventory.move', 'inventory.adjust']);
    const page = fixture.componentInstance;

    for (const operation of ['receipt', 'issue', 'loss', 'adjustment', 'transfer'] as const) {
      page.setOperation(operation);
      fixture.detectChanges();
      const sourceOptions = [...fixture.nativeElement.querySelectorAll('#location-0 option') as NodeListOf<HTMLOptionElement>]
        .map((option) => option.value);
      expect(sourceOptions).toEqual(['', '2', '9']);
      if (operation === 'transfer') {
        const destinationOptions = [...fixture.nativeElement.querySelectorAll('#destination-0 option') as NodeListOf<HTMLOptionElement>]
          .map((option) => option.value);
        expect(destinationOptions).toEqual(sourceOptions);
      }
    }
    fixture.destroy();
  });

  it('keeps a backend submit error visible in the movement form', async () => {
    await createFixture(['inventory.move']);
    receiveMovement.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 409,
      error: { message: 'La ubicación está inactiva.' },
    })));
    const page = fixture.componentInstance;
    page.form.controls.supplier_id.setValue('3');
    const line = page.lines.at(0);
    line.controls.product_id.setValue('4');
    line.controls.stock_location_id.setValue('2');
    line.controls.quantity.setValue('1');

    await page.submit();
    fixture.detectChanges();

    expect(page.mutation()).toBe('error');
    expect(page.error()).toBe('La ubicación está inactiva.');
    expect(fixture.nativeElement.querySelector('.feedback.error')?.textContent).toContain('La ubicación está inactiva.');
    fixture.destroy();
  });

  it('shows the exact counted-minus-registered difference with the selected product unit', async () => {
    await createFixture();
    const line = fixture.componentInstance.lines.at(0);
    line.controls.product_id.setValue('4');
    line.controls.stock_location_id.setValue('2');
    expect(requests).toHaveLength(1);

    requests[0].next(balancesResponse([balance(2, '9007199254740993.000001')]));
    await fixture.whenStable();
    fixture.detectChanges();
    line.controls.counted_quantity.setValue('9007199254740993,000003');

    expect(fixture.componentInstance.registeredQuantityFor(line)).toBe('9.007.199.254.740.993,000001 kg');
    expect(fixture.componentInstance.differenceFor(line)).toBe('+0,000002 kg');
    fixture.destroy();
  });

  it('ignores a stale balance response after the selected location changes', async () => {
    await createFixture();
    const line = fixture.componentInstance.lines.at(0);
    line.controls.product_id.setValue('4');
    line.controls.stock_location_id.setValue('2');
    line.controls.stock_location_id.setValue('9');
    expect(requests).toHaveLength(2);

    requests[0].next(balancesResponse([balance(2, '5')]));
    await fixture.whenStable();
    expect(fixture.componentInstance.balanceStateFor(line).status).toBe('loading');

    requests[1].next(balancesResponse([balance(9, '8')]));
    await fixture.whenStable();
    expect(fixture.componentInstance.balanceStateFor(line).status).toBe('ready');
    expect(fixture.componentInstance.registeredQuantityFor(line)).toBe('8 kg');
    fixture.destroy();
  });

  it('shows the balance as unavailable when the filtered response has no matching record', async () => {
    await createFixture();
    const line = fixture.componentInstance.lines.at(0);
    line.controls.product_id.setValue('4');
    line.controls.stock_location_id.setValue('2');
    requests[0].next(balancesResponse([]));
    await fixture.whenStable();

    expect(fixture.componentInstance.balanceStateFor(line).status).toBe('unavailable');
    fixture.destroy();
  });

  it('refreshes quantity validation and keypad mode for discrete products in movement and adjustment operations', async () => {
    await createFixture(['inventory.adjust', 'inventory.move']);
    const page = fixture.componentInstance;
    const line = page.lines.at(0);
    line.controls.product_id.setValue('4');
    page.setOperation('receipt');
    line.controls.quantity.setValue('1,5');
    expect(line.controls.quantity.valid).toBe(true);
    expect(page.quantityInputModeFor(line)).toBe('decimal');

    line.controls.product_id.setValue('5');
    expect(line.controls.quantity.invalid).toBe(true);
    expect(page.quantityInputModeFor(line)).toBe('numeric');
    line.controls.quantity.setValue('2');
    expect(line.controls.quantity.valid).toBe(true);

    page.setOperation('adjustment');
    line.controls.counted_quantity.setValue('2,5');
    expect(line.controls.counted_quantity.invalid).toBe(true);
    line.controls.counted_quantity.setValue('2');
    expect(line.controls.counted_quantity.valid).toBe(true);
    fixture.destroy();
  });

  it('keeps the entered decimal precision when the form builds a movement payload', async () => {
    await createFixture(['inventory.move']);
    const page = fixture.componentInstance;
    page.form.controls.supplier_id.setValue('3');
    const line = page.lines.at(0);
    line.controls.product_id.setValue('4');
    line.controls.stock_location_id.setValue('2');
    line.controls.quantity.setValue('12,500000');
    expect(page.operation()).toBe('receipt');
    expect(page.referencesState()).toBe('success');
    expect(page.form.valid).toBe(true);

    await page.submit();

    expect(receiveMovement).toHaveBeenCalledTimes(1);
    expect(receiveMovement.mock.calls[0][0].lines[0].quantity).toBe('12.500000');
    fixture.destroy();
  });

  it('renders the registered stock and positive, negative, and zero adjustment differences', async () => {
    await createFixture();
    const page = fixture.componentInstance;
    const line = page.lines.at(0);
    line.controls.product_id.setValue('4');
    line.controls.stock_location_id.setValue('2');
    requests[0].next(balancesResponse([balance(2, '10')]));
    await fixture.whenStable();
    fixture.detectChanges();

    const summaryText = (): string => fixture.nativeElement.querySelector('.adjustment-summary')?.textContent ?? '';
    expect(summaryText()).toContain('Resumen del ajuste');
    expect(summaryText()).toContain('Stock registrado actualmente');
    expect(summaryText()).toContain('10 kg');
    expect(summaryText()).toContain('Ingresa una cantidad válida para ver la diferencia.');

    const input = fixture.nativeElement.querySelector('#counted-0') as HTMLInputElement;
    const enterCount = async (value: string): Promise<void> => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await enterCount('20');
    expect(summaryText()).toContain('+10 kg');

    await enterCount('0');
    expect(page.differenceFor(line)).toBe('-10 kg');
    expect(summaryText()).toContain('-10 kg');

    await enterCount('10');
    expect(summaryText()).toContain('0 kg');
    fixture.destroy();
  });

  it('accepts an explicitly entered zero count and preserves it in the adjustment payload', async () => {
    await createFixture();
    const page = fixture.componentInstance;
    const line = page.lines.at(0);
    line.controls.product_id.setValue('4');
    line.controls.stock_location_id.setValue('2');
    requests[0].next(balancesResponse([balance(2, '10')]));
    await fixture.whenStable();
    line.controls.counted_quantity.setValue('0');
    page.form.controls.reason.setValue('Conteo físico');

    expect(line.controls.counted_quantity.valid).toBe(true);
    expect(page.form.valid).toBe(true);
    expect(page.lines.valid).toBe(true);

    await page.submit();

    expect(adjustMovement).toHaveBeenCalledTimes(1);
    expect(adjustMovement.mock.calls[0][0].lines[0]).toEqual({
      product_id: 4,
      stock_location_id: 2,
      counted_quantity: '0',
    });
    fixture.destroy();
  });

  it('keeps the adjustment summary and difference independent for multiple lines', async () => {
    await createFixture();
    const page = fixture.componentInstance;
    page.addLine();
    const firstLine = page.lines.at(0);
    const secondLine = page.lines.at(1);
    firstLine.controls.product_id.setValue('4');
    firstLine.controls.stock_location_id.setValue('2');
    secondLine.controls.product_id.setValue('4');
    secondLine.controls.stock_location_id.setValue('9');

    expect(requests).toHaveLength(2);
    requests[0].next(balancesResponse([balance(2, '3')]));
    requests[1].next(balancesResponse([balance(9, '8')]));
    await fixture.whenStable();
    firstLine.controls.counted_quantity.setValue('4');
    secondLine.controls.counted_quantity.setValue('4');
    fixture.detectChanges();

    const summaries = [...fixture.nativeElement.querySelectorAll('.adjustment-summary') as NodeListOf<HTMLElement>];
    expect(summaries).toHaveLength(2);
    expect(summaries[0].textContent).toContain('+1 kg');
    expect(summaries[1].textContent).toContain('-4 kg');
    fixture.destroy();
  });

  it('does not reveal an initially invalid quantity after focus and blur without editing', async () => {
    await createFixture(['inventory.move']);
    await fixture.componentInstance.loadReferences();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#quantity-0') as HTMLInputElement;
    const quantity = fixture.componentInstance.lines.at(0).controls.quantity;

    input.focus();
    input.blur();
    fixture.detectChanges();

    expect(quantity.touched).toBe(true);
    expect(quantity.pristine).toBe(true);
    expect(fixture.nativeElement.querySelector('#quantity-error-0')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    fixture.destroy();
  });

  it('reveals an edited invalid quantity and keeps ARIA state aligned with the message', async () => {
    await createFixture(['inventory.move']);
    await fixture.componentInstance.loadReferences();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#quantity-0') as HTMLInputElement;
    const quantity = fixture.componentInstance.lines.at(0).controls.quantity;

    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    input.blur();
    fixture.detectChanges();

    expect(quantity.dirty).toBe(true);
    expect(quantity.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('#quantity-error-0')).not.toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('quantity-error-0');
    fixture.destroy();
  });

  it('reveals invalid fields after submit and resets that visibility when changing operation', async () => {
    await createFixture(['inventory.move']);
    await fixture.componentInstance.loadReferences();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const input = fixture.nativeElement.querySelector('#quantity-0') as HTMLInputElement;

    await page.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#quantity-error-0')).not.toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('quantity-error-0');

    page.setOperation('issue');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#quantity-error-0')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    fixture.destroy();
  });
});
