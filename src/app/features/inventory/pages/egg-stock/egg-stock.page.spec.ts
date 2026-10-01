import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ProductionUnit } from '../../../production-units/interfaces/production-unit.interface';
import { EggStockTransaction } from '../../interfaces/inventory';
import { EggStockApi } from '../../services/egg-stock.api';
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

const createUnitContext = (units: ProductionUnit[], initialId: number | null) => {
  const selectedId = signal(initialId);
  return {
    selectedId,
    selectedUnit: computed(() => units.find((unit) => unit.id === selectedId()) ?? null),
  };
};

describe('EggStock active production-unit integration', () => {
  it('does not request stock or show a local unit selector when the global selection is empty', async () => {
    const context = createUnitContext([productionUnit(12, 'Granja Norte')], null);
    const balance = vi.fn(() => of({ data: { production_unit_id: 12, balance: 86 } }));
    const movements = vi.fn(() => of(emptyMovements));
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: AdminUnitContextService, useValue: context },
        { provide: EggStockApi, useValue: { balance, movements } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedUnit()).toBeNull();
    expect(balance).not.toHaveBeenCalled();
    expect(movements).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.unit-picker')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No hay una unidad productiva seleccionada.');
    fixture.destroy();
  });

  it('reloads the global unit selection and clears the prior unit data', async () => {
    const context = createUnitContext([productionUnit(12, 'Granja Norte'), productionUnit(27, 'Granja Sur')], 12);
    const requestedUnitIds: number[] = [];
    const api = {
      balance: (id: number) => {
        requestedUnitIds.push(id);
        return of({ data: { production_unit_id: id, balance: id } });
      },
      movements: (id: number) => {
        requestedUnitIds.push(id);
        return of({
          ...emptyMovements,
          data: [{ id: 'egg-' + id, production_unit_id: id, type: 'manual_receipt' as const, quantity: id, occurred_at: '2026-09-01', reason: 'Unidad ' + id, notes: null, status: 'recorded' as const, version: 1, reference: null }],
        });
      },
    };
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: AdminUnitContextService, useValue: context },
        { provide: EggStockApi, useValue: api },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(fixture.componentInstance.balance()).toBe(12);
    expect(fixture.componentInstance.transactions()[0].reason).toBe('Unidad 12');
    expect(fixture.nativeElement.textContent).toContain('Granja Norte');

    context.selectedId.set(27);
    fixture.detectChanges();
    expect(fixture.componentInstance.balance()).toBeNull();
    expect(fixture.componentInstance.transactions()).toEqual([]);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(requestedUnitIds).toEqual([12, 12, 27, 27]);
    expect(fixture.componentInstance.balance()).toBe(27);
    expect(fixture.componentInstance.transactions()).toHaveLength(1);
    expect(fixture.componentInstance.transactions()[0].reason).toBe('Unidad 27');
    expect(fixture.nativeElement.textContent).not.toContain('Unidad 12');
    expect(fixture.nativeElement.textContent).toContain('Granja Sur');
    fixture.destroy();
  });
  it('selects one permitted action at a time and does not offer production receipts for manual creation', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Sur')], 8) },
        { provide: EggStockApi, useValue: {
          balance: () => of({ data: { production_unit_id: 8, balance: 10 } }),
          movements: () => of(emptyMovements),
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.count-section')).not.toBeNull();
    expect(root.querySelectorAll('.action-picker .action-button')).toHaveLength(3);

    const receiptButton = Array.from(root.querySelectorAll<HTMLButtonElement>('.action-picker button')).find((button) => button.textContent?.includes('Registrar ingreso'));
    receiptButton?.click();
    fixture.detectChanges();
    expect(root.querySelector('.count-section')).toBeNull();
    expect(root.querySelectorAll('.commands .command-form')).toHaveLength(1);
    expect(root.querySelector('.commands .command-form')?.textContent).toContain('Ingreso manual');

    const issueButton = Array.from(root.querySelectorAll<HTMLButtonElement>('.action-picker button')).find((button) => button.textContent?.includes('Registrar salida'));
    issueButton?.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.commands .command-form')).toHaveLength(1);
    expect(root.querySelector('.commands .command-form')?.textContent).toContain('Salida de huevos');
    expect(root.querySelector('.commands .command-form select')).toBeNull();
    expect(root.querySelector('.commands')?.textContent).toContain('pérdida');
    expect(root.querySelector('.commands')?.textContent).not.toContain('Preparación de reparto');
    expect(issueButton?.getAttribute('aria-pressed')).toBe('true');
    fixture.destroy();
  });

  it('shows returned movement identity and signed quantities in the history rows', async () => {
    const longReason = 'Motivo largo de corrección que debe conservarse completo para que se pueda revisar sin perder palabras al final de la fila.';
    const movements = [
      { id: 'egg-1', production_unit_id: 8, type: 'collection_receipt' as const, quantity: 320, occurred_at: '2026-09-27T00:00:00Z', reason: longReason, notes: null, status: 'recorded' as const, version: 2, reference: { type: 'egg_collection', id: 'collection-1' }, actor: { id: 7, name: 'Juan' }, revisions: [{ id: 'revision-1', action: 'correct', before: {}, after: {}, correction_reason: 'Corrección de prueba', operation_id: 'operation-1', created_by: 7, created_at: '2026-09-28T00:00:00Z' }] },
      { id: 'egg-2', production_unit_id: 8, type: 'distribution_preparation' as const, quantity: 180, occurred_at: '2026-09-26T00:00:00Z', reason: 'Pedido confirmado', notes: null, status: 'cancelled' as const, version: 2, reference: null, actor: { id: 12, name: '' }, revisions: [{ id: 'revision-2', action: 'cancel', before: {}, after: {}, correction_reason: 'Cancelación de prueba', operation_id: 'operation-2', created_by: 12, created_at: '2026-09-28T00:00:00Z' }] },
      { id: 'egg-3', production_unit_id: 8, type: 'manual_receipt' as const, quantity: 120, occurred_at: '2026-09-25T00:00:00Z', reason: 'Carga inicial', notes: null, status: 'cancelled' as const, version: 1, reference: null, actor: null },
    ];
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Norte')], 8) },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => of({ data: { production_unit_id: id, balance: 4680 } }),
          movements: () => of({ ...emptyMovements, data: movements, meta: { ...emptyMovements.meta, total: movements.length } }),
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const table = root.querySelector('table.movement-table');
    expect(table).not.toBeNull();
    expect(Array.from(table!.querySelectorAll('thead th')).map((header) => header.textContent?.trim())).toEqual(['Fecha', 'Movimiento', 'Actor', 'Motivo', 'Estado', 'Cantidad', 'Acción']);
    expect(table!.querySelectorAll('thead th')).toHaveLength(7);
    const rows = Array.from(root.querySelectorAll<HTMLElement>('.movement-row'));
    expect(rows).toHaveLength(3);
    expect(Array.from(rows[0].querySelectorAll('td')).map((cell) => cell.dataset['label'])).toEqual(['Fecha', 'Movimiento', 'Actor', 'Motivo', 'Estado', 'Cantidad', 'Acción']);
    expect(rows[0].textContent).toContain('Juan');
    expect(rows[0].querySelector('.movement-quantity')?.textContent).toContain('+320 huevos');
    expect(rows[1].textContent).toContain('ID 12');
    expect(rows[1].querySelector('.movement-quantity')?.textContent).toContain('−180 huevos');
    expect(rows[2].textContent).toContain('Actor no informado');
    expect(rows[2].querySelector('.movement-quantity')?.textContent).toContain('+120 huevos');
    expect(rows[2].textContent).toContain('Cancelado');
    expect(rows[0].querySelector('.movement-date time')?.textContent).toBeTruthy();
    expect(rows[0].querySelector('.movement-type strong')?.textContent).toContain('Ingreso de producción');
    expect(rows[0].querySelector('.movement-actor')?.textContent).toContain('Juan');
    expect(rows[0].querySelector('.movement-reason span:last-child')?.textContent).toBe(longReason);
    expect(rows[0].querySelector('.movement-status .status')?.textContent).toContain('Registrado');
    expect(rows[0].querySelector('.movement-status .corrected')?.textContent).toContain('Corregido');
    expect(rows[0].querySelector('.movement-detail a')?.textContent).toContain('Ver detalle');
    expect(rows[1].querySelector('.movement-status .corrected')).toBeNull();
    fixture.destroy();
  });

  it('reloads the corrected server row after re-entry without adding a duplicate row', async () => {
    const context = createUnitContext([productionUnit(8, 'Granja Norte')], 8);
    let currentBalance = 80;
    let currentMovements: EggStockTransaction[] = [{
      id: 'egg-corrected', production_unit_id: 8, type: 'manual_receipt' as const, quantity: 25,
      occurred_at: '2026-09-27T00:00:00Z', reason: 'Original', notes: null, status: 'recorded' as const,
      version: 1, reference: null, actor: { id: 7, name: 'Ana' },
    }];
    const balance = vi.fn((id: number) => of({ data: { production_unit_id: id, balance: currentBalance } }));
    const movements = vi.fn(() => of({ ...emptyMovements, data: currentMovements, meta: { ...emptyMovements.meta, total: currentMovements.length } }));
    const api = { balance, movements };
    TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: AdminUnitContextService, useValue: context },
        { provide: EggStockApi, useValue: api },
      ],
    });

    const firstVisit = TestBed.createComponent(EggStockPage);
    await firstVisit.whenStable();
    firstVisit.detectChanges();
    expect(firstVisit.componentInstance.balance()).toBe(80);
    expect(firstVisit.nativeElement.querySelectorAll('.movement-row')).toHaveLength(1);
    firstVisit.destroy();

    currentBalance = 75;
    currentMovements = [{
      id: 'egg-corrected', production_unit_id: 8, type: 'manual_receipt', quantity: 42,
      occurred_at: '2026-09-28T00:00:00Z', reason: 'Corregido desde el detalle', notes: null, status: 'recorded',
      version: 2, reference: null, actor: { id: 7, name: 'Ana' },
      revisions: [{ id: 'rev-1', action: 'correct', before: {}, after: {}, correction_reason: 'Ajuste revisado', operation_id: 'op-1', created_by: 7, created_at: '2026-09-28T00:00:00Z' }],
    }];
    const secondVisit = TestBed.createComponent(EggStockPage);
    await secondVisit.whenStable();
    secondVisit.detectChanges();
    expect(balance).toHaveBeenCalledTimes(2);
    expect(movements).toHaveBeenCalledTimes(2);
    expect(secondVisit.componentInstance.balance()).toBe(75);
    expect(secondVisit.nativeElement.querySelectorAll('.movement-row')).toHaveLength(1);
    expect(secondVisit.nativeElement.querySelector('.movement-quantity')?.textContent).toContain('+42 huevos');
    expect(secondVisit.nativeElement.querySelector('.movement-status .corrected')?.textContent).toContain('Corregido');
    secondVisit.destroy();
  });

  it('keeps the current balance and history when a physical count fails', async () => {
    const transaction = { id: 'egg-before', production_unit_id: 8, type: 'manual_receipt' as const, quantity: 8, occurred_at: '2026-09-25T00:00:00Z', reason: 'Ingreso anterior', notes: null, status: 'recorded' as const, version: 1, reference: null };
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['egg-stock.adjust'] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Sur')], 8) },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => of({ data: { production_unit_id: id, balance: 86 } }),
          movements: () => of({ ...emptyMovements, data: [transaction] }),
          physicalCount: () => throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'No se pudo registrar el conteo.' } })),
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.physicalCountForm.setValue({ counted_quantity: '90', occurred_at: '2026-09-28', reason: 'Recuento' });
    await page.submitPhysicalCount();
    fixture.detectChanges();
    expect(page.balance()).toBe(86);
    expect(page.transactions()).toEqual([transaction]);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.movement-row')).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('physical_count');
    expect(page.error()).toContain('El servidor no pudo completar la operación.');
    fixture.destroy();
  });

  it('keeps movement filters, clears them, and requests the selected pagination page', async () => {
    const requestedFilters: Array<Record<string, unknown>> = [];
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Sur')], 8) },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => of({ data: { production_unit_id: id, balance: 86 } }),
          movements: (_id: number, filters: Record<string, unknown>) => {
            requestedFilters.push(filters);
            return of({
              ...emptyMovements,
              data: [{ id: 'egg-page', production_unit_id: 8, type: 'manual_receipt' as const, quantity: 1, occurred_at: '2026-09-27', reason: 'Movimiento', notes: null, status: 'recorded' as const, version: 1, reference: null }],
              meta: { ...emptyMovements.meta, current_page: Number(filters['page'] ?? 1), last_page: 3, total: 60 },
            });
          },
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.filters.setValue({ status: 'cancelled', type: 'loss', date_from: '2026-09-01', date_to: '2026-09-25' });
    await page.load();
    expect(requestedFilters.at(-1)).toEqual({ status: 'cancelled', type: 'loss', date_from: '2026-09-01', date_to: '2026-09-25', per_page: 25, page: 1 });

    page.clearFilters();
    await fixture.whenStable();
    expect(requestedFilters.at(-1)).toEqual({ status: undefined, type: undefined, date_from: undefined, date_to: undefined, per_page: 25, page: 1 });
    fixture.detectChanges();
    const next = (fixture.nativeElement as HTMLElement).querySelector('.pagination button:last-child') as HTMLButtonElement;
    next.click();
    await fixture.whenStable();
    expect(requestedFilters.at(-1)).toEqual({ status: undefined, type: undefined, date_from: undefined, date_to: undefined, per_page: 25, page: 2 });
    fixture.destroy();
  });

  it('filters and shows both physical counts and delivery returns with their correct balance signs', async () => {
    const requestedFilters: Array<Record<string, unknown>> = [];
    const movements = [
      { id: 'count-1', production_unit_id: 8, type: 'physical_count' as const, quantity: 5, occurred_at: '2026-09-28T00:00:00Z', reason: 'Conteo', notes: null, status: 'recorded' as const, version: 1, reference: null, balance_before: 86, counted_quantity: 91, difference: 5 },
      { id: 'return-1', production_unit_id: 8, type: 'distribution_return' as const, quantity: 12, occurred_at: '2026-09-29T00:00:00Z', reason: 'Devolución de reparto', notes: null, status: 'recorded' as const, version: 1, reference: { type: 'delivery', id: 'delivery-1' } },
    ];
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Sur')], 8) },
        { provide: EggStockApi, useValue: {
          balance: () => of({ data: { production_unit_id: 8, balance: 103 } }),
          movements: (_id: number, filters: Record<string, unknown>) => {
            requestedFilters.push(filters);
            return of({ ...emptyMovements, data: movements, meta: { ...emptyMovements.meta, total: movements.length } });
          },
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.movement-filters option[value="physical_count"]')).not.toBeNull();
    expect(root.querySelector('.movement-filters option[value="distribution_return"]')?.textContent).toContain('Devolución de reparto');
    expect(root.textContent).toContain('Conteo físico');
    expect(root.textContent).toContain('Devolución de reparto');
    expect(root.querySelectorAll('.movement-row')).toHaveLength(2);
    expect(root.querySelectorAll('.movement-quantity')[0].textContent).toContain('+5 huevos');
    expect(root.querySelectorAll('.movement-quantity')[1].textContent).toContain('+12 huevos');

    page.filters.controls.type.setValue('physical_count');
    await page.load();
    expect(requestedFilters.at(-1)?.['type']).toBe('physical_count');
    page.filters.controls.type.setValue('distribution_return');
    await page.load();
    expect(requestedFilters.at(-1)?.['type']).toBe('distribution_return');
    fixture.destroy();
  });

  it('previews positive, negative and equal counts, then refreshes the balance and history after submit', async () => {
    let committed = false;
    const count = vi.fn().mockImplementation((_unitId: number, _body: unknown, _key: string) => {
      committed = true;
      return of({ data: {
        id: 'count-1', production_unit_id: 8, type: 'physical_count', quantity: 14,
        occurred_at: '2026-09-27T00:00:00Z', reason: 'Verificación semanal', notes: null,
        status: 'recorded', version: 1, reference: null, balance_before: 86,
        counted_quantity: 100, difference: 14, actor: { id: 9, name: 'Ana' },
      } });
    });
    const counted = {
      id: 'count-1', production_unit_id: 8, type: 'physical_count' as const, quantity: 14,
      occurred_at: '2026-09-27T00:00:00Z', reason: 'Verificación semanal', notes: null,
      status: 'recorded' as const, version: 1, reference: null, balance_before: 86,
      counted_quantity: 100, difference: 14, actor: { id: 9, name: 'Ana' },
    };
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['egg-stock.adjust'] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Sur')], 8) },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => of({ data: { production_unit_id: id, balance: committed ? 100 : 86 } }),
          movements: () => of({ ...emptyMovements, data: committed ? [counted] : [], meta: { ...emptyMovements.meta, total: committed ? 1 : 0 } }),
          physicalCount: count,
        } },
      ],
    }).createComponent(EggStockPage);

    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.physicalCountForm.setValue({ counted_quantity: '100', occurred_at: '2026-09-27', reason: 'Verificación semanal' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.count-preview')?.textContent).toContain('+14 huevos');
    expect((fixture.nativeElement as HTMLElement).querySelector('.count-preview')?.textContent).toContain('Se sumarán 14 huevos');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.movement-row')).toHaveLength(0);

    (fixture.nativeElement.querySelector('.count-section .form-actions button[type="button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(page.physicalCountForm.controls.counted_quantity.value).toBe('');
    expect((fixture.nativeElement as HTMLElement).querySelector('.count-preview')).toBeNull();
    expect(page.transactions()).toEqual([]);
    page.physicalCountForm.setValue({ counted_quantity: '100', occurred_at: '2026-09-27', reason: 'Verificación semanal' });
    fixture.detectChanges();

    page.physicalCountForm.controls.counted_quantity.setValue('72');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.count-preview')?.textContent).toContain('−14 huevos');
    expect((fixture.nativeElement as HTMLElement).querySelector('.count-preview')?.textContent).toContain('Se descontarán 14 huevos');
    page.physicalCountForm.controls.counted_quantity.setValue('86');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.count-preview')?.textContent).toContain('0 huevos');
    expect((fixture.nativeElement as HTMLElement).querySelector('.count-preview')?.textContent).toContain('El saldo coincide');

    page.physicalCountForm.controls.counted_quantity.setValue('100');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.count-section button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(count).toHaveBeenCalledWith(8, {
      counted_quantity: 100, expected_balance: 86, reason: 'Verificación semanal', occurred_at: '2026-09-27',
    }, expect.any(String));
    expect(page.balance()).toBe(100);
    expect(page.transactions()).toEqual([counted]);
    expect(fixture.nativeElement.textContent).toContain('Conteo físico');
    expect(fixture.nativeElement.textContent).toContain('Sobrante · +14 huevos');
    fixture.destroy();
  });

  it('shows stale-balance errors and reuses the idempotency key for the same retry', async () => {
    const keys: string[] = [];
    const refreshedTransaction = { id: 'egg-refreshed', production_unit_id: 8, type: 'physical_count' as const, quantity: 0, occurred_at: '2026-09-28T00:00:00Z', reason: 'Conteo concurrente', notes: null, status: 'recorded' as const, version: 1, reference: null, balance_before: 86, counted_quantity: 86, difference: 0 };
    const balance = vi.fn(() => of({ data: { production_unit_id: 8, balance: 86 } }));
    const movements = vi.fn()
      .mockReturnValueOnce(of(emptyMovements))
      .mockReturnValue(of({ ...emptyMovements, data: [refreshedTransaction], meta: { ...emptyMovements.meta, total: 1 } }));
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['egg-stock.adjust'] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Sur')], 8) },
        { provide: EggStockApi, useValue: {
          balance,
          movements,
          physicalCount: (_id: number, _body: unknown, key: string) => {
            keys.push(key);
            return throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'El saldo teórico cambió. Actualiza el saldo antes de confirmar.' } }));
          },
        } },
      ],
    }).createComponent(EggStockPage);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.physicalCountForm.setValue({ counted_quantity: '90', occurred_at: '2026-09-27', reason: 'Recuento' });

    await page.submitPhysicalCount();
    fixture.detectChanges();
    expect(balance).toHaveBeenCalledTimes(2);
    expect(movements).toHaveBeenCalledTimes(2);
    expect(page.balance()).toBe(86);
    expect(page.transactions()).toEqual([refreshedTransaction]);
    expect(page.physicalCountForm.getRawValue()).toEqual({ counted_quantity: '90', occurred_at: '2026-09-27', reason: 'Recuento' });
    expect(page.error()).toBe('El saldo teórico cambió. Actualiza el saldo antes de confirmar.');
    await page.submitPhysicalCount();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(balance).toHaveBeenCalledTimes(3);
    expect(movements).toHaveBeenCalledTimes(3);
    expect(page.physicalCountForm.getRawValue()).toEqual({ counted_quantity: '90', occurred_at: '2026-09-27', reason: 'Recuento' });
    fixture.destroy();
  });

  it('shows backend validation errors beside the physical-count fields', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['egg-stock.adjust'] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Sur')], 8) },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => of({ data: { production_unit_id: id, balance: 86 } }),
          movements: () => of(emptyMovements),
          physicalCount: () => throwError(() => new HttpErrorResponse({ status: 422, error: { message: 'Revisa el motivo.', errors: { reason: ['El motivo no es válido.'] } } })),
        } },
      ],
    }).createComponent(EggStockPage);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.physicalCountForm.setValue({ counted_quantity: '90', occurred_at: '2026-09-27', reason: 'Recuento' });

    await page.submitPhysicalCount();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Revisa el motivo.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('El motivo no es válido.');
    fixture.destroy();
  });

  it('offers physical counts only to users with the existing egg-stock.adjust permission', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [EggStockPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['egg-stock.move'] }) } },
        { provide: AdminUnitContextService, useValue: createUnitContext([productionUnit(8, 'Granja Sur')], 8) },
        { provide: EggStockApi, useValue: {
          balance: (id: number) => of({ data: { production_unit_id: id, balance: 86 } }),
          movements: () => of(emptyMovements),
        } },
      ],
    }).createComponent(EggStockPage);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.count-section')).toBeNull();
    expect(fixture.nativeElement.querySelector('.commands')).not.toBeNull();
    fixture.destroy();
  });
});
