import { HttpErrorResponse } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { EggDonationDialogComponent } from '../../components/egg-donation-dialog/egg-donation-dialog.component';
import { EggStockTransaction, PaginatedResponse } from '../../interfaces/inventory';
import { EggStockApi } from '../../services/egg-stock.api';
import { EggDonationsPage } from './egg-donations.page';

const units = [{ id: 2, name: 'Granja Santa Clara' }, { id: 3, name: 'Granja El Ombú' }];
const unitPage = (data = units, lastPage = 1) => ({ data, meta: { current_page: 1, last_page: lastPage } });
const donation = (id: string, reason = 'Comedor barrial', status: 'recorded' | 'cancelled' = 'recorded'): EggStockTransaction => ({
  id, production_unit_id: 2, type: 'donation', quantity: 120, occurred_at: '2026-10-26T13:30:00Z', reason, notes: null, status, version: 1, reference: null,
});
const history = (data: EggStockTransaction[] = [], page = 1, lastPage = 1): PaginatedResponse<EggStockTransaction> => ({
  data, links: { first: null, last: null, next: null, prev: null },
  meta: { current_page: page, last_page: lastPage, total: data.length, per_page: 20, from: null, to: null },
});

describe('Egg donations page', () => {
  let fixture: ComponentFixture<EggDonationsPage>;
  let restore: () => void;
  const api = { donationUnits: vi.fn(), balance: vi.fn(), movements: vi.fn(), donate: vi.fn() };
  const user = signal({ id: 1, permissions: ['egg-stock.view', 'egg-stock.move'] });
  const selectedId = signal<number | null>(2);
  const contextState = signal<'loading' | 'ready' | 'error'>('ready');
  const unitContext = { selectedId, state: contextState, selectedUnit: computed(() => units.find((unit) => unit.id === selectedId()) ?? null) };

  beforeEach(() => {
    restore = stubNativeDialog(); vi.resetAllMocks();
    user.set({ id: 1, permissions: ['egg-stock.view', 'egg-stock.move'] });
    selectedId.set(2); contextState.set('ready');
    api.donationUnits.mockReturnValue(of(unitPage()));
    api.balance.mockImplementation((id: number) => of({ data: { production_unit_id: id, balance: id === 2 ? 9503 : 477 } }));
    api.movements.mockReturnValue(of(history()));
    api.donate.mockReturnValue(of({ data: { transaction: 'donation-id' } }));
  });
  afterEach(() => { fixture?.destroy(); restore(); });

  async function render() {
    await TestBed.configureTestingModule({
      imports: [EggDonationsPage], providers: [provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false, user } },
        { provide: AdminUnitContextService, useValue: unitContext },
        { provide: EggStockApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(EggDonationsPage); fixture.detectChanges();
    await settle();
  }
  async function settle() {
    await fixture.whenStable(); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
  }
  function page() { return fixture.componentInstance; }
  function button(label: string) { return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!; }
  function openFilters() { (fixture.nativeElement.querySelector('.filter-trigger') as HTMLButtonElement).click(); fixture.detectChanges(); return fixture.nativeElement.querySelector('.filters-dialog') as HTMLDialogElement; }
  function dialogComponent() { return fixture.debugElement.query(By.directive(EggDonationDialogComponent)).componentInstance as EggDonationDialogComponent; }

  it('shows the selected unit, real balance and empty history without a permanent creation form', async () => {
    await render();
    expect(fixture.nativeElement.querySelector('.unit-name').textContent).toBe('Granja Santa Clara');
    expect(fixture.nativeElement.querySelector('#donation-unit')).toBeNull();
    expect(api.movements).toHaveBeenCalledWith(2, expect.objectContaining({ type: 'donation', page: 1, per_page: 20 }));
    expect(fixture.nativeElement.querySelector('.balance-value').textContent).toContain('9.503');
    expect(fixture.nativeElement.textContent).toContain('Aún no hay donaciones');
    expect(fixture.nativeElement.querySelector('.donation-dialog').open).toBe(false);
    expect(fixture.nativeElement.querySelector('.stock-link').getAttribute('href')).toContain('production_unit_id=2');
    expect(fixture.nativeElement.querySelector('.stock-link').getAttribute('href')).toContain('from=donaciones');
  });

  it('loads eligible units without replacing the global selection and follows subsequent global changes', async () => {
    api.donationUnits.mockImplementation((_search: string, requested: number) => of(requested === 1
      ? unitPage([units[0]], 2) : { data: [units[1]], meta: { current_page: 2, last_page: 2 } }));
    await render();
    expect(api.donationUnits.mock.calls).toEqual([['', 1], ['', 2]]);
    expect(page().unit()).toBe(2);
    selectedId.set(3); await settle();
    expect(page().balance()).toBe(477);
    expect(api.movements).toHaveBeenLastCalledWith(3, expect.objectContaining({ type: 'donation' }));
    selectedId.set(null); await settle();
    expect(page().balance()).toBeNull(); expect(page().records()).toEqual([]);
    expect(page().meta()).toBeNull(); expect(button('Nueva donación').disabled).toBe(true);
    page().openDonation(document.createElement('button')); await settle();
    expect(page().dialogOpen()).toBe(false); expect(api.donate).not.toHaveBeenCalled();
  });

  it('keeps Todas on entry without automatically selecting an eligible unit or allowing donations', async () => {
    selectedId.set(null); await render();
    expect(page().unit()).toBeNull(); expect(selectedId()).toBeNull();
    expect(fixture.nativeElement.querySelector('.unit-name').textContent).toBe('Todas las UP');
    expect(fixture.nativeElement.querySelector('#donation-unit-hint').textContent).toContain('filtro global');
    expect(button('Nueva donación').disabled).toBe(true);
    page().openDonation(document.createElement('button'));
    expect(page().dialogOpen()).toBe(false);
    expect(api.balance).not.toHaveBeenCalled(); expect(api.movements).not.toHaveBeenCalled(); expect(api.donate).not.toHaveBeenCalled();
  });

  it('respects a previously selected global UP and blocks donating in an ineligible UP', async () => {
    selectedId.set(3); api.donationUnits.mockReturnValue(of(unitPage([units[0]])));
    await render();
    expect(page().unit()).toBe(3); expect(selectedId()).toBe(3);
    expect(api.balance).toHaveBeenCalledWith(3);
    expect(button('Nueva donación').disabled).toBe(true);
    page().openDonation(document.createElement('button'));
    expect(page().dialogOpen()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Esta unidad no está disponible');
  });

  it('closes the creation draft and prevents a donation after changing the global filter to Todas', async () => {
    await render(); button('Nueva donación').click(); await settle();
    dialogComponent().form.patchValue({ quantity: '20', reason: 'Borrador' });
    selectedId.set(null); await settle();
    expect(page().dialogOpen()).toBe(false); expect(dialogComponent().unit()).toBeNull();
    expect(dialogComponent().form.controls.reason.value).toBe('');
    await dialogComponent().save(); expect(api.donate).not.toHaveBeenCalled();
    selectedId.set(3); await settle(); button('Nueva donación').click(); await settle();
    expect(dialogComponent().unit()?.id).toBe(3); expect(dialogComponent().form.controls.quantity.value).toBe('');
  });

  it('keeps applied history filters and resets pagination when the global UP changes', async () => {
    await render(); page().filters.patchValue({ status: 'cancelled', date_from: '2026-10-01' });
    await page().applyFilters(); await page().load(3); openFilters();
    selectedId.set(3); await settle();
    expect(api.movements).toHaveBeenLastCalledWith(3, expect.objectContaining({ status: 'cancelled', date_from: '2026-10-01', page: 1 }));
    expect(fixture.nativeElement.querySelector('.filters-dialog').open).toBe(false);
    contextState.set('error'); await settle();
    expect(page().balance()).toBeNull(); expect(page().records()).toEqual([]);
    expect(button('Nueva donación').disabled).toBe(true);
  });

  it('does not show an empty history while units and history are still loading', async () => {
    const pendingUnits = new Subject<ReturnType<typeof unitPage>>(); const pendingHistory = new Subject<ReturnType<typeof history>>();
    contextState.set('loading');
    api.donationUnits.mockReturnValue(pendingUnits); api.movements.mockReturnValue(pendingHistory);
    await render();
    expect(page().unitsState()).toBe('loading'); expect(page().unit()).toBeNull();
    expect(api.balance).not.toHaveBeenCalled(); expect(api.movements).not.toHaveBeenCalled();
    contextState.set('ready'); pendingUnits.next(unitPage()); await settle();
    expect(page().historyState()).toBe('loading');
    expect(fixture.nativeElement.textContent).not.toContain('Aún no hay donaciones');
    pendingHistory.next(history()); await settle(); expect(page().historyState()).toBe('empty');
  });

  it('keeps balance and history errors independent and retries only the failed query', async () => {
    api.balance.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    api.movements.mockReturnValue(of(history([donation('one')])));
    await render();
    expect(page().balanceState()).toBe('error'); expect(page().historyState()).toBe('success');
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Comedor barrial');
    button('Reintentar saldo').click(); await settle();
    expect(page().balance()).toBe(9503); expect(api.movements).toHaveBeenCalledTimes(1);
    api.movements.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    await page().load(); await settle();
    expect(page().balance()).toBe(9503); expect(page().historyState()).toBe('error');
    button('Reintentar historial').click(); await settle(); expect(page().historyState()).toBe('success');
  });

  it('represents empty and failed unit lists and can recover without invented stock', async () => {
    api.donationUnits.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await render(); expect(page().unitsState()).toBe('error'); expect(button('Nueva donación').disabled).toBe(true);
    api.donationUnits.mockReturnValueOnce(of(unitPage([])));
    button('Reintentar unidades').click(); await settle();
    expect(page().unitsState()).toBe('empty'); expect(button('Nueva donación').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No hay unidades productivas activas');
    await page().loadUnits(); await settle(); expect(page().unit()).toBe(2);
  });

  it('ignores late unit list responses and late pages of a replaced lookup', async () => {
    const old = new Subject<ReturnType<typeof unitPage>>();
    api.donationUnits.mockReturnValueOnce(old);
    await render(); await page().loadUnits(); await settle();
    old.next(unitPage([{ id: 99, name: 'Respuesta antigua' }], 2)); await settle();
    expect(page().units().some((unit) => unit.id === 99)).toBe(false);
    expect(api.donationUnits.mock.calls).toEqual([['', 1], ['', 1]]);
  });

  it('ignores A → B → A responses and old errors for both balance and history', async () => {
    const oldBalance = new Subject<{ data: { production_unit_id: number; balance: number } }>();
    const oldHistory = new Subject<ReturnType<typeof history>>();
    api.balance.mockReturnValueOnce(oldBalance); api.movements.mockReturnValueOnce(oldHistory);
    await render();
    selectedId.set(3); await settle(); selectedId.set(2); await settle();
    expect(page().balance()).toBe(9503);
    oldBalance.next({ data: { production_unit_id: 2, balance: 1 } });
    oldHistory.error(new HttpErrorResponse({ status: 500 })); await settle();
    expect(page().balance()).toBe(9503); expect(page().historyState()).toBe('empty');
    expect(page().historyError()).toBeNull();
  });

  it('applies only status and date drafts, keeps them when paginating, and leaves the balance independent', async () => {
    await render(); const modal = openFilters();
    page().filters.setValue({ status: 'recorded', date_from: '2026-10-01', date_to: '2026-10-26' });
    expect(api.movements).toHaveBeenCalledTimes(1);
    await page().applyFilters(); await settle();
    expect(modal.open).toBe(false); expect(page().activeFilterCount()).toBe(3);
    expect(api.movements).toHaveBeenLastCalledWith(2, expect.objectContaining({ type: 'donation', status: 'recorded', date_from: '2026-10-01', date_to: '2026-10-26', page: 1 }));
    await page().load(2);
    expect(api.movements).toHaveBeenLastCalledWith(2, expect.objectContaining({ status: 'recorded', page: 2 }));
    expect(api.balance).toHaveBeenCalledTimes(1);
    openFilters(); page().clearDraftFilters();
    expect(page().activeFilterCount()).toBe(3);
    modal.dispatchEvent(new Event('cancel', { cancelable: true }));
    openFilters(); expect(page().filters.controls.status.value).toBe('recorded');
    await page().load(3); expect(api.movements).toHaveBeenLastCalledWith(2, expect.objectContaining({ date_to: '2026-10-26', page: 3 }));
  });

  it('keeps invalid date ranges in the filters dialog and restores focus when cancelling', async () => {
    await render(); const trigger = button('Filtros'); const modal = openFilters();
    page().filters.patchValue({ date_from: '2026-10-26', date_to: '2026-10-01' });
    await page().applyFilters(); await settle();
    expect(modal.open).toBe(true); expect(page().filterError()).toContain('anterior');
    expect(api.movements).toHaveBeenCalledTimes(1); expect(page().activeFilterCount()).toBe(0);
    modal.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(document.activeElement).toBe(trigger);
    openFilters(); expect(page().filters.controls.date_from.value).toBe('');
    expect(page().filterError()).toBeNull();
  });

  it('ignores late filter responses and uses applied filters after clearing a cancelled draft', async () => {
    await render();
    const oldHistory = new Subject<ReturnType<typeof history>>(); api.movements.mockReturnValueOnce(oldHistory);
    const oldLoad = page().load(2);
    page().filters.patchValue({ status: 'cancelled' }); await page().applyFilters();
    oldHistory.next(history([donation('old')])); await oldLoad; await settle();
    expect(page().records()).toEqual([]); expect(page().appliedFilters().status).toBe('cancelled');
    page().clearFilters(); await settle(); expect(page().activeFilterCount()).toBe(0);
    expect(api.movements).toHaveBeenLastCalledWith(2, expect.objectContaining({ type: 'donation', status: undefined, page: 1 }));
  });

  it('renders registered and cancelled donations with the specialized detail links', async () => {
    api.movements.mockReturnValue(of(history([donation('one'), donation('two', 'Escuela rural', 'cancelled')], 1, 2)));
    await render();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    expect(fixture.nativeElement.querySelector('tr.cancelled').textContent).toContain('No afecta al saldo');
    expect(fixture.nativeElement.querySelector('.detail-link').getAttribute('href')).toBe('/administracion/inventario/existencias/huevos/movimientos/one');
    expect(button('Siguiente').disabled).toBe(false);
    button('Siguiente').click(); await settle();
    expect(api.movements).toHaveBeenLastCalledWith(2, expect.objectContaining({ page: 2 }));
  });

  it('opens creation with global UP context and refreshes both reads after success', async () => {
    await render(); button('Nueva donación').click(); await settle();
    expect(page().dialogOpen()).toBe(true); expect(dialogComponent().unit()?.id).toBe(2);
    dialogComponent().form.setValue({ quantity: '120', occurred_at: '2026-01-10T10:30', reason: 'Comedor', notes: '' });
    await dialogComponent().save(); await settle();
    expect(page().dialogOpen()).toBe(false); expect(page().notice()).toContain('Granja Santa Clara');
    expect(api.balance).toHaveBeenCalledTimes(2); expect(api.movements).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(button('Nueva donación'));
  });

  it('allows read-only use and prevents creation both in the UI and in handlers', async () => {
    user.set({ id: 1, permissions: ['egg-stock.view'] }); await render();
    expect(button('Nueva donación')).toBeUndefined(); expect(api.balance).toHaveBeenCalledWith(2);
    page().openDonation(document.createElement('button'));
    expect(page().dialogOpen()).toBe(false);
  });

  it('allows movement-only users to donate without querying or fabricating the balance/history', async () => {
    user.set({ id: 1, permissions: ['egg-stock.move'] }); await render();
    expect(api.balance).not.toHaveBeenCalled(); expect(api.movements).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.history')).toBeNull();
    button('Nueva donación').click(); await settle();
    expect(dialogComponent().balance()).toBeNull(); expect(dialogComponent().result()).toBeNull();
    expect(page().dialogOpen()).toBe(true);
  });

  it('does not fetch data for a user without donation permissions', async () => {
    user.set({ id: 1, permissions: [] }); await render();
    expect(api.donationUnits).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('no tiene permiso');
  });

  it('clears employee data on identity changes and ignores results after destroy', async () => {
    await render();
    const old = new Subject<{ data: { production_unit_id: number; balance: number } }>();
    api.balance.mockReturnValueOnce(old); const loading = page().loadBalance();
    user.set({ id: 2, permissions: [] }); await settle();
    expect(page().unit()).toBeNull(); expect(page().records()).toEqual([]);
    old.next({ data: { production_unit_id: 2, balance: 123 } }); await loading;
    expect(page().balance()).toBeNull();
    user.set({ id: 3, permissions: ['egg-stock.view'] }); await settle();
    const late = new Subject<ReturnType<typeof history>>(); api.movements.mockReturnValueOnce(late);
    const request = page().load(); fixture.destroy();
    late.next(history([donation('late')])); await request;
    expect(page().records()).toEqual([]);
  });
});
