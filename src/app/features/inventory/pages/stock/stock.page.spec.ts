import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryApi } from '../../services/inventory.api';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { StockBalance } from '../../interfaces/inventory';
import { stubNativeDialog } from '../../testing/native-dialog-test';
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
  stock_location: { id: 2, name: 'Depósito', system_managed: false, status: 'active' },
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
  let restoreNativeDialog: () => void;

  beforeEach(() => { restoreNativeDialog = stubNativeDialog(); });
  afterEach(() => { restoreNativeDialog(); });

  const createFixture = (permissions: string[], inventoryApi: Partial<InventoryApi> = {}) => TestBed.configureTestingModule({
    imports: [StockPage],
    providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions }) } },
      { provide: InventoryApi, useValue: {
        balances: () => of(emptyBalances),
        setMinimumStock: () => of({ data: balance }),
        ...inventoryApi,
      } },
      { provide: InventoryReferenceApi, useValue: { options: () => of(emptyReferences) } },
    ],
  }).createComponent(StockPage);

  it('offers movement registration only to users with an existing movement permission', async () => {
    const allowed = createFixture(['inventory.move']);
    await allowed.whenStable();
    allowed.detectChanges();
    const action = Array.from((allowed.nativeElement as HTMLElement).querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Registrar movimiento') as HTMLAnchorElement | undefined;
    expect(action?.textContent?.trim()).toBe('Registrar movimiento');
    expect(action?.getAttribute('href')).toBe('/administracion/inventario/ajustes-y-perdidas');
    allowed.destroy();
  });

  it('does not offer movement registration without a movement or adjustment permission', async () => {
    const denied = createFixture([]);
    await denied.whenStable();
    denied.detectChanges();
    const movementAction = Array.from((denied.nativeElement as HTMLElement).querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Registrar movimiento');
    expect(movementAction).toBeUndefined();
    denied.destroy();
  });

  it.each([
    { scenario: 'without', permissions: [] as string[] },
    { scenario: 'with', permissions: ['inventory.manage'] },
  ])('removes maintenance access from Existencias $scenario inventory permission', async ({ permissions }) => {
    const fixture = createFixture(permissions);
    await fixture.whenStable();
    fixture.detectChanges();

    const pageText = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(pageText).not.toContain('Nuevo producto');
    expect(pageText).not.toContain('Gestionar ubicaciones');
    expect(pageText).not.toContain('Ver ubicaciones');
    fixture.destroy();
  });

  it('applies below-minimum only on submit and clears back to the unfiltered server response', async () => {
    const atOrAboveMinimum: StockBalance = {
      ...balance,
      id: 10,
      product_id: 6,
      product: { ...balance.product, id: 6, sku: 'EQ-6', name: 'Alimento al mínimo' },
      available_quantity: '12.500000',
    };
    const balances = vi.fn()
      .mockReturnValueOnce(of(emptyBalances))
      .mockReturnValueOnce(of({ ...emptyBalances, data: [balance], meta: { ...emptyBalances.meta, from: 1, to: 1, total: 1 } }))
      .mockReturnValueOnce(of({ ...emptyBalances, data: [balance, atOrAboveMinimum], meta: { ...emptyBalances.meta, from: 1, to: 2, total: 2 } }));
    const fixture = TestBed.configureTestingModule({
      imports: [StockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: [] }) } },
        { provide: InventoryApi, useValue: { balances, setMinimumStock: () => of({ data: {} }) } },
        { provide: InventoryReferenceApi, useValue: { options: () => of(emptyReferences) } },
      ],
    }).createComponent(StockPage);

    await fixture.whenStable();
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(balances).toHaveBeenCalledTimes(1);

    checkbox.click();
    fixture.detectChanges();
    expect(checkbox.checked).toBe(true);
    expect(balances).toHaveBeenCalledTimes(1);

    (fixture.nativeElement.querySelector('.filter-actions button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(balances).toHaveBeenLastCalledWith(expect.objectContaining({ below_minimum: true }));
    expect(fixture.nativeElement.textContent).toContain('Alimento');
    expect(fixture.nativeElement.textContent).not.toContain('Alimento al mínimo');

    (fixture.nativeElement.querySelector('.filter-actions button[type="button"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkbox.checked).toBe(false);
    expect(balances).toHaveBeenCalledTimes(3);
    expect(balances).toHaveBeenLastCalledWith(expect.objectContaining({ below_minimum: undefined }));
    expect(fixture.nativeElement.textContent).toContain('Alimento al mínimo');
    fixture.destroy();
  });

  it('also allows the existing adjustment permission and translates product kinds', async () => {
    const fixture = createFixture(['inventory.adjust']);
    await fixture.whenStable();
    fixture.detectChanges();

    const movementAction = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Registrar movimiento');
    expect(movementAction?.textContent?.trim()).toBe('Registrar movimiento');
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

  it('opens the modal with the minimum prefilled and cancels without an API request', async () => {
    const setMinimumStock = vi.fn(() => of({ data: balance }));
    const fixture = createFixture(['inventory.manage'], {
      balances: () => of({ ...emptyBalances, data: [balance], meta: { ...emptyBalances.meta, from: 1, to: 1, total: 1 } }),
      setMinimumStock,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const opener = fixture.nativeElement.querySelector('td[data-label="Acción"] button') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const input = dialog.querySelector('#minimum-quantity') as HTMLInputElement;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('12,5');
    expect(dialog.textContent).toContain('Producto');
    expect(dialog.textContent).toContain('Alimento');
    expect(dialog.textContent).toContain('Ubicación');
    expect(dialog.textContent).toContain('Depósito');
    expect(dialog.textContent).toContain('Disponible actual');
    expect(dialog.textContent).toContain('5 kg');
    expect(dialog.textContent).toContain('Mínimo actual');

    (dialog.querySelector('.minimum-actions button[type="button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(dialog.open).toBe(false);
    expect(setMinimumStock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);

    opener.click();
    fixture.detectChanges();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(dialog.open).toBe(false);
    expect(setMinimumStock).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('sends the decimal payload once and closes with the updated row and success feedback', async () => {
    const updated = { ...balance, minimum_quantity: '5.250000' };
    const setMinimumStock = vi.fn((_id: number, _minimum: string) => of({ data: updated }));
    const fixture = createFixture(['inventory.manage'], {
      balances: () => of({ ...emptyBalances, data: [balance], meta: { ...emptyBalances.meta, from: 1, to: 1, total: 1 } }),
      setMinimumStock,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('td[data-label="Acción"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const input = dialog.querySelector('#minimum-quantity') as HTMLInputElement;
    input.value = '5,250000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const save = dialog.querySelector('button[type="submit"]') as HTMLButtonElement;
    save.click();
    save.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setMinimumStock).toHaveBeenCalledTimes(1);
    expect(setMinimumStock).toHaveBeenCalledWith(balance.id, '5.250000');
    expect(dialog.open).toBe(false);
    expect(fixture.componentInstance.balances()[0].minimum_quantity).toBe('5.250000');
    expect(fixture.nativeElement.querySelector('[data-label="Mínimo"]')?.textContent).toContain('5,25 kg');
    expect(fixture.componentInstance.success()).toBe('Stock mínimo actualizado.');
    expect(fixture.nativeElement.textContent).toContain('Stock mínimo actualizado.');
    fixture.destroy();
  });

  it('keeps backend errors visible in the open modal', async () => {
    const backendError = new HttpErrorResponse({
      status: 422,
      error: { message: 'Revisa el mínimo.', errors: { minimum_quantity: ['El mínimo supera el límite permitido.'] } },
    });
    const setMinimumStock = vi.fn(() => throwError(() => backendError));
    const fixture = createFixture(['inventory.manage'], {
      balances: () => of({ ...emptyBalances, data: [balance], meta: { ...emptyBalances.meta, from: 1, to: 1, total: 1 } }),
      setMinimumStock,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('td[data-label="Acción"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const save = dialog.querySelector('button[type="submit"]') as HTMLButtonElement;
    save.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.minimum-error')?.textContent).toContain('Revisa el mínimo.');
    expect(dialog.textContent).toContain('El mínimo supera el límite permitido.');
    expect(setMinimumStock).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('preserves nonnegative precision and discrete-unit minimum validation', async () => {
    const setMinimumStock = vi.fn((_id: number, _minimum: string) => of({ data: balance }));
    const fixture = createFixture(['inventory.manage'], {
      balances: () => of({ ...emptyBalances, data: [balance, doseBalance], meta: { ...emptyBalances.meta, from: 1, to: 2, total: 2 } }),
      setMinimumStock,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const opener = fixture.nativeElement.querySelector('td[data-label="Acción"] button') as HTMLButtonElement;
    opener.click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const input = dialog.querySelector('#minimum-quantity') as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.value).toBe('12,5');
    input.value = '-1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    (dialog.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.minimumForm.invalid).toBe(true);
    expect(setMinimumStock).not.toHaveBeenCalled();

    (dialog.querySelector('.minimum-actions button[type="button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const doseRow = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tr'))
      .find((row) => row.textContent?.includes('Dosis'));
    const doseOpener = doseRow?.querySelector('button') as HTMLButtonElement;
    doseOpener.click();
    fixture.detectChanges();
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.value).toBe('2');
    input.value = '2,5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    (dialog.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.minimumForm.invalid).toBe(true);
    expect(setMinimumStock).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
