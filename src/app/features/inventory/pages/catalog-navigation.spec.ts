import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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
import { ProductsApi } from '../services/products.api';
import { productsRoutes } from '../products.routes';
import { ProductCreatePage } from './product-create/product-create.page';
import { CatalogCreatePage } from '../../health-catalogs/pages/catalog-create/catalog-create.page';
import { medicationRoutes, vaccinationRoutes } from '../../health-catalogs/health-catalogs.routes';
import { HealthCatalogsApi } from '../../health-catalogs/services/health-catalogs.api';
import { medicineItem, vaccineItem } from '../../health-catalogs/testing/health-catalog-fixtures';

const response = <T>(data: T[], lastPage = 1) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, last_page: lastPage, per_page: 100, total: data.length },
});

describe('navigation from the stock and global catalog', () => {
  it.each([
    { catalog: 'medicacion', item: medicineItem, action: 'success' },
    { catalog: 'vacunacion', item: vaccineItem, action: 'success' },
    { catalog: 'medicacion', item: medicineItem, action: 'cancel' },
    { catalog: 'vacunacion', item: vaccineItem, action: 'cancel' },
  ])('returns from $catalog ($action) to new product, preserves its origin and allows creation', async ({ catalog, item, action }) => {
    const productPath = '/administracion/inventario/existencias/productos/nuevo';
    const origin = '/administracion/inventario/existencias';
    const input = { name: 'Herramienta', sku: 'HERR-01', kind: 'supply' as const, base_unit: 'unit' as const, stock_tracked: true };
    const createProduct = vi.fn(() => of({ data: { ...input, id: 17, status: 'active', system_managed: false, specialized_owner: null,
      capabilities: { editable_fields: [], activate: false, deactivate: false } } }));
    const createCatalog = vi.fn(() => of(item));
    TestBed.configureTestingModule({ providers: [
      provideRouter([
        { path: 'administracion/inventario/existencias/productos', children: productsRoutes },
        { path: 'administracion/manejo-lotes/medicacion', children: medicationRoutes },
        { path: 'administracion/manejo-lotes/vacunacion', children: vaccinationRoutes },
      ]),
      { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ id: 1, permissions: [] }) } },
      { provide: ProductsApi, useValue: { create: createProduct } },
      { provide: HealthCatalogsApi, useValue: { create: createCatalog,
        suppliers: () => of([{ id: 4, name: 'Proveedor', status: 'active' }]) } },
    ] });
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    const originalUrl = router.serializeUrl(router.createUrlTree([productPath], { queryParams: { returnTo: origin } }));
    await harness.navigateByUrl(originalUrl, ProductCreatePage);
    harness.routeNativeElement?.querySelector<HTMLAnchorElement>(`a[href*="${catalog}/nuevo"]`)?.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(router.url).toContain(`${catalog}/nuevo?from=products`);
    const catalogPage = harness.routeDebugElement?.componentInstance as CatalogCreatePage;
    expect(catalogPage).toBeInstanceOf(CatalogCreatePage);
    if (action === 'success') {
      catalogPage.form.setValue({ name: item.name, description: item.description, supplier: '4', sku: 'VAC-01', details: '' });
      await catalogPage.submit(); await harness.fixture.whenStable(); harness.detectChanges();
      expect(createCatalog).toHaveBeenCalledTimes(1);
      expect(catalogPage.canLeave()).toBe(true);
    }
    const returnLink = harness.routeNativeElement?.querySelector<HTMLAnchorElement>(action === 'success' ? '.success .button.primary' : 'a.back');
    expect(returnLink?.textContent).toContain('Volver a Nuevo producto');
    returnLink?.click(); await harness.fixture.whenStable(); harness.detectChanges();
    expect(router.url).toBe(originalUrl);
    const productPage = harness.routeDebugElement?.componentInstance as ProductCreatePage;
    expect(productPage).toBeInstanceOf(ProductCreatePage);
    productPage.form.setValue(input); await productPage.submit();
    expect(createProduct).toHaveBeenCalledExactlyOnceWith(input);
    expect(productPage.createdProduct()?.id).toBe(17);
    if (action === 'cancel') expect(createCatalog).not.toHaveBeenCalled();
  });

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
