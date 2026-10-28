import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { InventoryApi } from '../services/inventory.api';
import { InventoryReferenceApi } from '../services/inventory-reference.api';
import { StockLocationsApi } from '../services/stock-locations.api';
import { SuppliersApi } from '../../suppliers-catalogs/suppliers/suppliers.api';
import { MovementsPage } from './movements/movements.page';
import { MovementFormPage } from './movement-form/movement-form.page';
import { StockPage } from './stock/stock.page';

const response = <T>(data: T[], lastPage = 1) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, last_page: lastPage, per_page: 100, total: data.length },
});

describe('navigation from the stock and global catalog', () => {
  it('applies both stock-row filters on the first movement request', async () => {
    const movements = vi.fn(() => of(response([])));
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'movimientos', component: MovementsPage }]),
      { provide: AuthStore, useValue: { isAdmin: () => true, user: () => null } },
      { provide: InventoryApi, useValue: { movements } },
      { provide: InventoryReferenceApi, useValue: { options: () => of({ data: { products: [], stock_locations: [] } }) } },
    ] });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/movimientos?product_id=17&stock_location_id=9', MovementsPage);
    expect(page.filters.controls.product_id.value).toBe('17');
    expect(page.filters.controls.stock_location_id.value).toBe('9');
    expect(movements).toHaveBeenCalledWith(expect.objectContaining({ product_id: 17, stock_location_id: 9 }));
  });

  it('waits for a stock location before preselecting a catalogue product from a later allowed-products page', async () => {
    const product = { id: 17, sku: 'NEW-17', name: 'Producto nuevo', kind: 'supply', base_unit: 'kg', available_quantity: '0.000000' };
    const allowedProducts = vi.fn((filters: { page: number }) => of(response(filters.page === 1 ? [] : [product], 2)));
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'ingreso', component: MovementFormPage }]),
      { provide: AuthStore, useValue: { isAdmin: () => true, user: () => null } },
      { provide: InventoryApi, useValue: { allowedProducts } },
      { provide: SuppliersApi, useValue: { list: () => of(response([])) } },
      { provide: StockLocationsApi, useValue: { list: () => of(response([{ id: 9, name: 'Depósito', type: 'warehouse', allowed_product_kinds: ['supply', 'other'], status: 'active' }])) } },
    ] });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/ingreso?product_id=17', MovementFormPage);
    await harness.fixture.whenStable();
    expect(allowedProducts).not.toHaveBeenCalled();
    expect(page.lines.at(0).controls.product_id.value).toBe('');
    expect(page.lines.at(0).controls.stock_location_id.value).toBe('');
    expect(page.operation()).toBe('receipt');
    page.lines.at(0).controls.stock_location_id.setValue('9');
    await harness.fixture.whenStable();
    expect(allowedProducts).toHaveBeenCalledWith({ stock_location_id: 9, operation: 'receipt', per_page: 100, page: 2 });
    expect(page.lines.at(0).controls.product_id.value).toBe('17');
  });

  it('opens physical inventory for the product linked to a health catalog record', async () => {
    const balances = vi.fn(() => of(response([])));
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'stock', component: StockPage }]),
      { provide: AuthStore, useValue: { isAdmin: () => true, user: () => null } },
      { provide: InventoryApi, useValue: { balances } },
      { provide: StockLocationsApi, useValue: { list: () => of(response([])) } },
      { provide: InventoryReferenceApi, useValue: { options: () => of({ data: { products: [], stock_locations: [] } }) } },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/stock?product_id=9', StockPage); await harness.fixture.whenStable();
    expect(balances).toHaveBeenCalledWith(expect.objectContaining({ product_id: 9 }));
  });
});
