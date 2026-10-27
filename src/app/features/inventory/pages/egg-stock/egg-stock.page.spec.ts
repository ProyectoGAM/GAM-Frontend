import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { ProductionUnit } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { EggStockApi } from '../../services/egg-stock.api';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { EggStockPage } from './egg-stock.page';
import { EggStockTransaction, PaginatedResponse } from '../../interfaces/inventory';
import { stubNativeDialog } from '../../testing/native-dialog-test';

const productionUnit = (id: number, name: string): ProductionUnit => ({
  id,
  name,
  status: 'active',
  locality: {
    id: 1,
    department_id: 1,
    name: 'Localidad',
    department: { id: 1, name: 'Departamento' },
  },
});

const emptyMovements = {
  data: [],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: null, last_page: 1, per_page: 25, to: null, total: 0 },
};

describe('EggStock production-unit integration', () => {
  let restoreDialog: () => void;
  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => { restoreDialog(); });
  it.each([['27', 27], ['999', 12]])('opens the requested donation unit %s when it is available', async (requested, expected) => {
    const balance = vi.fn((id: number) => of({ data: { production_unit_id: id, balance: 86 } }));
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage], providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ production_unit_id: requested }) } } },
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => of([productionUnit(12, 'Granja Norte'), productionUnit(27, 'Granja Sur')]) } },
        { provide: EggStockApi, useValue: { balance, movements: () => of(emptyMovements) } },
      ],
    }).createComponent(EggStockPage);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedUnit()).toBe(expected);
    expect(balance).toHaveBeenCalledWith(expected);
    fixture.destroy();
  });
  it('loads units from ProductionUnitsService and keeps selected IDs numeric', async () => {
    let listAllCalls = 0;
    let referenceOptionsCalls = 0;
    const requestedUnitIds: unknown[] = [];
    const units = [productionUnit(12, 'Granja Norte'), productionUnit(27, 'Granja Sur')];
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => { listAllCalls += 1; return of(units); } } },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => { requestedUnitIds.push(id); return of({ data: { production_unit_id: id, balance: 86 } }); },
          movements: (id: number) => { requestedUnitIds.push(id); return of(emptyMovements); },
        } },
        { provide: InventoryReferenceApi, useValue: { options: () => { referenceOptionsCalls += 1; return of({ data: { production_units: [] } }); } } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(listAllCalls).toBe(1);
    expect(referenceOptionsCalls).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Granja Norte');
    expect(requestedUnitIds).toEqual([12, 12]);

    const selector = fixture.nativeElement.querySelector('.unit-picker select') as HTMLSelectElement;
    expect(selector.value).toBe('12');
    selector.value = '27';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();

    expect(requestedUnitIds.slice(-2)).toEqual([27, 27]);
    expect(requestedUnitIds.every((id) => typeof id === 'number')).toBe(true);
    fixture.destroy();
  });

  it('shows an initial unit-load failure and retries through the same real source', async () => {
    let listAllCalls = 0;
    const requestedUnitIds: unknown[] = [];
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => {
          listAllCalls += 1;
          return listAllCalls === 1 ? throwError(() => new Error('offline')) : of([productionUnit(34, 'Granja Este')]);
        } } },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => { requestedUnitIds.push(id); return of({ data: { production_unit_id: id, balance: 50 } }); },
          movements: (id: number) => { requestedUnitIds.push(id); return of(emptyMovements); },
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las unidades productivas. Intentá nuevamente.');
    expect(fixture.componentInstance.selectedUnit()).toBeNull();

    const retry = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reintentar');
    expect(retry).toBeDefined();
    retry?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listAllCalls).toBe(2);
    expect(fixture.componentInstance.selectedUnit()).toBe(34);
    expect(fixture.componentInstance.balance()).toBe(50);
    expect(requestedUnitIds).toEqual([34, 34]);
    expect(fixture.nativeElement.textContent).toContain('Granja Este');
    fixture.destroy();
  });

  it('keeps loaded balance and history when a later unit refresh fails, and recovers on retry', async () => {
    let listAllCalls = 0;
    const transaction = { id: 'egg-1', production_unit_id: 19, type: 'manual_receipt', quantity: 5, occurred_at: '2026-01-01', reason: 'Conteo', notes: null, status: 'recorded', version: 1, reference: null };
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => {
          listAllCalls += 1;
          return listAllCalls === 2 ? throwError(() => new Error('offline')) : of([productionUnit(19, 'Granja Centro')]);
        } } },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => of({ data: { production_unit_id: id, balance: 86 } }),
          movements: () => of({ ...emptyMovements, data: [transaction] }),
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    const page = fixture.componentInstance;
    expect(page.balance()).toBe(86);
    expect(page.transactions()).toEqual([transaction]);

    await page.loadProductionUnits();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las unidades productivas. Intentá nuevamente.');
    expect(page.balance()).toBe(86);
    expect(page.transactions()).toEqual([transaction]);

    const retry = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reintentar');
    expect(retry).toBeDefined();
    retry?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listAllCalls).toBe(3);
    expect(page.balance()).toBe(86);
    expect(page.transactions()).toEqual([transaction]);
    expect(page.productionUnitsError()).toBeNull();
    fixture.destroy();
  });

  it('shows one manual operation at a time and does not offer production receipts for manual creation', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => of([productionUnit(8, 'Granja Sur')]) } },
        { provide: EggStockApi, useValue: {
          balance: () => of({ data: { production_unit_id: 8, balance: 10 } }),
          movements: () => of(emptyMovements),
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('dialog')?.open).toBe(false);
    root.querySelector<HTMLButtonElement>('.register-movement')?.click();
    fixture.detectChanges();
    expect(root.querySelector('dialog')?.open).toBe(true);
    expect(root.querySelectorAll('.command-form')).toHaveLength(1);
    expect(root.querySelector('.command-form')?.textContent).not.toContain('Ingreso de producción');

    const issueButton = Array.from(root.querySelectorAll<HTMLButtonElement>('.operation-picker button')).find((button) => button.textContent?.trim() === 'Salida');
    expect(issueButton).toBeDefined();
    issueButton?.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.command-form')).toHaveLength(1);
    expect(root.querySelector('.command-form')?.textContent).toContain('Salida de huevos');
    expect(root.querySelector('.command-form select option[value="collection_receipt"]')).toBeNull();
    fixture.destroy();
  });
});

describe('Egg stock consultation and movement modal', () => {
  let restoreDialog: () => void;
  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => { restoreDialog(); });

  function setup(permissions = ['egg-stock.move']) {
    const api = {
      balance: vi.fn((id: number) => of({ data: { production_unit_id: id, balance: 9503 } })),
      movements: vi.fn(() => of<PaginatedResponse<EggStockTransaction>>(emptyMovements)),
      receipt: vi.fn().mockReturnValue(of({ data: { transaction: 'receipt-1' } })),
      issue: vi.fn().mockReturnValue(of({ data: { transaction: 'issue-1' } })),
    };
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage], providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => of([productionUnit(8, 'Granja Sur'), productionUnit(9, 'Granja Norte')]) } },
        { provide: EggStockApi, useValue: api },
      ],
    }).createComponent(EggStockPage);
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, api };
  }

  it('opens with the unit and quantity focus, and restores focus on Escape without a request', async () => {
    const { fixture, root, api } = setup();
    await fixture.whenStable(); fixture.detectChanges();
    const opener = root.querySelector<HTMLButtonElement>('.register-movement')!;
    opener.click(); fixture.detectChanges();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Granja Sur');
    expect(document.activeElement).toBe(root.querySelector('#egg-quantity'));
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(api.receipt).not.toHaveBeenCalled();
    expect(api.issue).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('keeps a failed command inside the modal, retries with the same key, then closes and refreshes', async () => {
    const { fixture, root, page, api } = setup();
    await fixture.whenStable(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.register-movement')!.click();
    page.receiptForm.patchValue({ quantity: '15', reason: 'Conteo manual' });
    api.receipt.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await page.submitReceipt(); fixture.detectChanges();
    expect(root.querySelector('dialog')!.open).toBe(true);
    expect(root.querySelector('dialog')!.textContent).toContain('No se pudo conectar');
    expect(page.receiptForm.controls.quantity.value).toBe('15');
    const key = api.receipt.mock.calls[0][2];
    await page.submitReceipt(); fixture.detectChanges();
    expect(api.receipt.mock.calls[1]).toEqual([8, { quantity: 15, occurred_at: undefined, reason: 'Conteo manual', notes: undefined }, key]);
    expect(root.querySelector('dialog')!.open).toBe(false);
    expect(page.receiptForm.controls.quantity.value).toBe('');
    expect(api.balance).toHaveBeenCalledTimes(2);
    expect(root.textContent).toContain('Ingreso de huevos registrado.');
    fixture.destroy();
  });

  it('blocks duplicate requests, closing, operation changes and unit changes while saving a loss', async () => {
    const { fixture, root, page, api } = setup();
    await fixture.whenStable(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.register-movement')!.click();
    page.selectOperation('issue'); fixture.detectChanges();
    page.issueForm.patchValue({ quantity: '12', type: 'loss', reason: 'Roturas' });
    const pending = new Subject<{ data: { transaction: string } }>();
    api.issue.mockReturnValue(pending);
    const saving = page.submitIssue();
    await page.submitIssue();
    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    page.selectOperation('receipt');
    await page.chooseUnit('9'); fixture.detectChanges();
    expect(api.issue).toHaveBeenCalledTimes(1);
    expect(api.issue.mock.calls[0][0]).toBe(8);
    expect(api.issue.mock.calls[0][1]).toMatchObject({ quantity: 12, type: 'loss', reason: 'Roturas' });
    expect(page.activeOperation()).toBe('issue');
    expect(page.selectedUnit()).toBe(8);
    expect(root.querySelector('dialog')!.open).toBe(true);
    expect(root.querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true);
    pending.next({ data: { transaction: 'loss-1' } }); pending.complete();
    await saving;
    expect(root.querySelector('dialog')!.open).toBe(false);
    fixture.destroy();
  });

  it('validates quantity, required reason and server errors before allowing another save', async () => {
    const { fixture, root, page, api } = setup();
    await fixture.whenStable(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.register-movement')!.click();
    for (const quantity of ['0', '-1', '1.5', '2147483648', '']) {
      page.receiptForm.patchValue({ quantity, reason: 'Conteo' });
      await page.submitReceipt();
    }
    page.receiptForm.patchValue({ quantity: '5', reason: '' });
    await page.submitReceipt();
    expect(api.receipt).not.toHaveBeenCalled();
    page.receiptForm.patchValue({ reason: 'Conteo' });
    api.receipt.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { reason: ['Describe el origen de los huevos.'] } } })));
    await page.submitReceipt(); fixture.detectChanges();
    expect(root.querySelector('dialog')!.textContent).toContain('Describe el origen de los huevos.');
    expect(page.receiptForm.invalid).toBe(true);
    page.receiptForm.controls.reason.setValue('Recuento de cámara');
    await page.submitReceipt();
    expect(api.receipt).toHaveBeenCalledTimes(2);
    expect(api.receipt.mock.calls[1][2]).not.toBe(api.receipt.mock.calls[0][2]);
    fixture.destroy();
  });

  it('does not expose or execute movements without the movement permission', async () => {
    const { fixture, root, page, api } = setup(['egg-stock.view']);
    await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('.register-movement')).toBeNull();
    page.receiptForm.patchValue({ quantity: '10', reason: 'Conteo' });
    await page.submitReceipt();
    expect(api.receipt).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('marks incoming, outgoing, returned and cancelled amounts without changing the current balance', async () => {
    const { fixture, root, page } = setup();
    await fixture.whenStable();
    const types = ['collection_receipt', 'manual_receipt', 'distribution_preparation', 'loss', 'donation', 'distribution_return'] as const;
    page.transactions.set(types.map((type, index) => ({ id: `egg-${index}`, production_unit_id: 8, type, quantity: 12, occurred_at: '2026-10-13T12:00:00Z', reason: 'Registro de prueba', notes: null, status: index === 3 ? 'cancelled' : 'recorded', version: 1, reference: null })));
    page.state.set('success'); fixture.detectChanges();
    const rows = [...root.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.querySelector('.quantity-cell strong')?.textContent)).toEqual(['+12', '+12', '−12', '−12', '−12', '+12']);
    expect(rows[0].textContent).toContain('Origen: Producción');
    expect(rows[3].textContent).toContain('Cancelado');
    expect(rows[3].textContent).toContain('No afecta al saldo');
    expect(root.querySelector('.balance-quantity')?.textContent).toContain('9.503');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/administracion/inventario/existencias/huevos/movimientos/egg-0');
    fixture.destroy();
  });

  it('applies history filters explicitly, validates the date range and keeps pagination on the applied query', async () => {
    const { fixture, page, api } = setup();
    await fixture.whenStable();
    page.filters.patchValue({ date_from: '2026-10-20', date_to: '2026-10-01' });
    page.applyFilters();
    expect(page.filterError()).toContain('anterior o igual');
    expect(api.movements).toHaveBeenCalledTimes(1);
    page.filters.patchValue({ type: 'distribution_return', status: 'cancelled', date_from: '2026-10-01', date_to: '2026-10-20' });
    page.applyFilters(); await fixture.whenStable();
    expect(api.movements.mock.calls.at(-1)).toEqual([8, { type: 'distribution_return', status: 'cancelled', date_from: '2026-10-01', date_to: '2026-10-20', per_page: 25, page: 1 }]);
    page.filters.controls.type.setValue('loss');
    await page.load(2);
    expect(api.movements.mock.calls.at(-1)).toEqual([8, { type: 'distribution_return', status: 'cancelled', date_from: '2026-10-01', date_to: '2026-10-20', per_page: 25, page: 2 }]);
    expect(page.balance()).toBe(9503);
    page.clearFilters(); await fixture.whenStable();
    expect(api.movements.mock.calls.at(-1)).toEqual([8, { per_page: 25, page: 1 }]);
    fixture.destroy();
  });

  it('clears the previous unit immediately and discards its late balance and history', async () => {
    const { fixture, page, api } = setup();
    await fixture.whenStable();
    const oldBalance = new Subject<{ data: { production_unit_id: number; balance: number } }>();
    const oldHistory = new Subject<PaginatedResponse<EggStockTransaction>>();
    api.balance.mockReturnValueOnce(oldBalance);
    api.movements.mockReturnValueOnce(oldHistory);
    const obsolete = page.load();
    await page.chooseUnit('9');
    expect(page.selectedUnit()).toBe(9);
    expect(page.balance()).toBe(9503);
    oldBalance.next({ data: { production_unit_id: 8, balance: 100 } }); oldBalance.complete();
    oldHistory.next(emptyMovements); oldHistory.complete();
    await obsolete;
    expect(page.balance()).toBe(9503);
    await page.chooseUnit(''); fixture.detectChanges();
    expect(page.balance()).toBeNull();
    expect(page.transactions()).toEqual([]);
    expect(page.state()).toBe('idle');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Selecciona una unidad productiva');
    fixture.destroy();
  });

  it('allows negative balances and explains them without inventing a minimum', async () => {
    const { fixture, page, root } = setup();
    await fixture.whenStable(); page.balance.set(-5); fixture.detectChanges();
    expect(root.querySelector('.balance-card')?.classList.contains('negative')).toBe(true);
    expect(root.querySelector('.balance-warning')?.textContent).toContain('por debajo de cero');
    expect(root.querySelector('.register-movement')).not.toBeNull();
    fixture.destroy();
  });
});
