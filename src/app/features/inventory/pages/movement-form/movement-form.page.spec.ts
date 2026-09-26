import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryApi } from '../../services/inventory.api';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { PaginatedResponse, Product, ReferenceOptions, StockBalance } from '../../interfaces/inventory';
import { MovementFormPage } from './movement-form.page';

const product: Product = {
  id: 4, sku: 'AL-4', name: 'Alimento', kind: 'supply', base_unit: 'kg', stock_tracked: true, status: 'active',
};
const doseProduct: Product = {
  id: 5, sku: 'DOS-5', name: 'Dosis', kind: 'medicine', base_unit: 'dose', stock_tracked: true, status: 'active',
};

const emptyReferences: ReferenceOptions = {
  production_units: [], suppliers: [], products: [], stock_locations: [{ value: 2, label: 'Depósito' }],
  types: { products: [], base_units: [], movements: [] },
  statuses: { production_units: [], products: [], stock_locations: [] },
};

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
  stock_location: { id: locationId, name: 'Depósito', status: 'active' },
  available_quantity: availableQuantity,
  minimum_quantity: '0',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

describe('Inventory movement adjustment comparison', () => {
  let fixture: ComponentFixture<MovementFormPage>;
  let requests: Subject<PaginatedResponse<StockBalance>>[];

  const createFixture = async (permissions = ['inventory.adjust']): Promise<void> => {
    requests = [];
    const api = {
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
          options: () => of({ data: emptyReferences }),
          activeProducts: () => of({ data: [product, doseProduct], links: { first: null, last: null, prev: null, next: null }, meta: { current_page: 1, from: 1, last_page: 1, per_page: 100, to: 2, total: 2 } }),
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MovementFormPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

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
    const receive = vi.fn().mockReturnValue(of({ data: {} }));
    await TestBed.configureTestingModule({
      imports: [MovementFormPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['inventory.move'] }) } },
        { provide: InventoryApi, useValue: { receive, balances: () => of(balancesResponse([])) } },
        { provide: InventoryReferenceApi, useValue: {
          options: () => of({ data: { ...emptyReferences, suppliers: [{ value: 3, label: 'Proveedor' }] } }),
          activeProducts: () => of({ data: [product], links: { first: null, last: null, prev: null, next: null }, meta: { current_page: 1, from: 1, last_page: 1, per_page: 100, to: 1, total: 1 } }),
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MovementFormPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    await page.loadReferences();
    page.form.controls.supplier_id.setValue('3');
    const line = page.lines.at(0);
    line.controls.product_id.setValue('4');
    line.controls.stock_location_id.setValue('2');
    line.controls.quantity.setValue('12,500000');
    expect(page.operation()).toBe('receipt');
    expect(page.referencesState()).toBe('success');
    expect(page.form.valid).toBe(true);

    await page.submit();

    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive.mock.calls[0][0].lines[0].quantity).toBe('12.500000');
    fixture.destroy();
  });
});
