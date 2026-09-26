import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { ProductionUnit } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { EggStockApi } from '../../services/egg-stock.api';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { EggStockPage } from './egg-stock.page';

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
