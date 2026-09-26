import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryApi } from '../../services/inventory.api';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { StockBalance } from '../../interfaces/inventory';
import { StockPage } from './stock.page';

const emptyBalances = {
  data: [],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: null, last_page: 1, per_page: 25, to: null, total: 0 },
};

const emptyReferences = {
  data: {
    production_units: [],
    suppliers: [],
    products: [],
    stock_locations: [],
    types: { products: [], base_units: [], movements: [] },
    statuses: { production_units: [], products: [], stock_locations: [] },
  },
};

const balance: StockBalance = {
  id: 8,
  product_id: 4,
  stock_location_id: 2,
  product: { id: 4, sku: 'AL-4', name: 'Alimento', kind: 'supply', base_unit: 'kg', stock_tracked: true, status: 'active' },
  stock_location: { id: 2, name: 'Depósito', status: 'active' },
  available_quantity: '5',
  minimum_quantity: '12.500000',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const doseBalance: StockBalance = {
  ...balance,
  id: 9,
  product_id: 5,
  product: { id: 5, sku: 'DOS-5', name: 'Dosis', kind: 'medicine', base_unit: 'dose', stock_tracked: true, status: 'active' },
  minimum_quantity: '2.000000',
};

describe('Existencias page', () => {
  const createFixture = (permissions: string[]) => TestBed.configureTestingModule({
    imports: [StockPage],
    providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions }) } },
      { provide: InventoryApi, useValue: {
        balances: () => of(emptyBalances),
        setMinimumStock: () => of({ data: {} }),
      } },
      { provide: InventoryReferenceApi, useValue: { options: () => of(emptyReferences) } },
    ],
  }).createComponent(StockPage);

  it('offers movement registration only to users with an existing movement permission', async () => {
    const allowed = createFixture(['inventory.move']);
    await allowed.whenStable();
    allowed.detectChanges();
    const action = allowed.nativeElement.querySelector('a.primary') as HTMLAnchorElement;
    expect(action?.textContent?.trim()).toBe('Registrar movimiento');
    expect(action?.getAttribute('href')).toBe('/administracion/inventario/ajustes-y-perdidas');
    allowed.destroy();
  });

  it('does not offer movement registration without a movement or adjustment permission', async () => {
    const denied = createFixture([]);
    await denied.whenStable();
    denied.detectChanges();
    expect(denied.nativeElement.querySelector('a.primary')).toBeNull();
    denied.destroy();
  });

  it('also allows the existing adjustment permission and translates product kinds', async () => {
    const fixture = createFixture(['inventory.adjust']);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a.primary')?.textContent?.trim()).toBe('Registrar movimiento');
    expect(fixture.componentInstance.kindLabel('raw_material')).toBe('Materia prima');
    expect(fixture.componentInstance.kindLabel('finished_feed')).toBe('Ración / alimento preparado');
    fixture.destroy();
  });

  it('shows and retries reference loading errors without hiding the balance list', async () => {
    let referenceCalls = 0;
    const fixture = TestBed.configureTestingModule({
      imports: [StockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: [] }) } },
        { provide: InventoryApi, useValue: {
          balances: () => of({ ...emptyBalances, data: [balance], meta: { ...emptyBalances.meta, from: 1, to: 1, total: 1 } }),
          setMinimumStock: () => of({ data: balance }),
        } },
        { provide: InventoryReferenceApi, useValue: { options: () => {
          referenceCalls += 1;
          return referenceCalls === 1 ? throwError(() => new Error('offline')) : of(emptyReferences);
        } } },
      ],
    }).createComponent(StockPage);

    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar los filtros. Podés reintentarlo.');
    expect(fixture.nativeElement.textContent).toContain('Alimento');

    const retry = fixture.nativeElement.querySelector('.feedback.error button') as HTMLButtonElement;
    retry.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(referenceCalls).toBe(2);
    expect(fixture.componentInstance.referencesError()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Las existencias siguen disponibles.');
    fixture.destroy();
  });

  it('validates a minimum and sends comma decimals using the API decimal format', async () => {
    const setMinimumStock = vi.fn((_id: number, minimum: string) => of({ data: { ...balance, minimum_quantity: minimum } }));
    const fixture = TestBed.configureTestingModule({
      imports: [StockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['inventory.manage'] }) } },
        { provide: InventoryApi, useValue: {
          balances: () => of({ ...emptyBalances, data: [balance, doseBalance], meta: { ...emptyBalances.meta, from: 1, to: 2, total: 2 } }),
          setMinimumStock,
        } },
        { provide: InventoryReferenceApi, useValue: { options: () => of(emptyReferences) } },
      ],
    }).createComponent(StockPage);

    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.editMinimum(balance);
    fixture.detectChanges();
    expect(page.minimumInputMode()).toBe('decimal');
    expect(fixture.nativeElement.querySelector('#minimum-quantity-8')?.getAttribute('inputmode')).toBe('decimal');
    expect(page.minimumForm.controls.minimum_quantity.value).toBe('12,5');
    page.minimumForm.setValue({ minimum_quantity: '-1' });
    await page.saveMinimum(balance);
    expect(page.minimumForm.invalid).toBe(true);
    expect(setMinimumStock).not.toHaveBeenCalled();

    page.editMinimum(balance);
    expect(page.minimumForm.controls.minimum_quantity.value).toBe('12,5');
    await page.saveMinimum(balance);
    expect(setMinimumStock).toHaveBeenCalledWith(balance.id, '12.500000');

    page.editMinimum(balance);
    page.minimumForm.setValue({ minimum_quantity: '5,250000' });
    await page.saveMinimum(balance);
    expect(setMinimumStock).toHaveBeenLastCalledWith(balance.id, '5.250000');
    expect(page.success()).toBe('Stock mínimo actualizado.');
    page.editMinimum(doseBalance);
    fixture.detectChanges();
    expect(page.minimumInputMode()).toBe('numeric');
    expect(fixture.nativeElement.querySelector('#minimum-quantity-9')?.getAttribute('inputmode')).toBe('numeric');
    expect(page.minimumForm.controls.minimum_quantity.value).toBe('2');
    page.minimumForm.setValue({ minimum_quantity: '2,5' });
    await page.saveMinimum(doseBalance);
    expect(page.minimumForm.invalid).toBe(true);
    expect(setMinimumStock).toHaveBeenCalledTimes(2);

    page.minimumForm.setValue({ minimum_quantity: '3' });
    await page.saveMinimum(doseBalance);
    expect(setMinimumStock).toHaveBeenLastCalledWith(doseBalance.id, '3');
    fixture.destroy();
  });
});
