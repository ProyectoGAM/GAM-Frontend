import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FeedStockBalance, FeedStockFilters } from '../../interfaces/feed-stock';
import { PaginatedResponse } from '../../interfaces/inventory';
import { FeedStockApi } from '../../services/feed-stock.api';
import { stubNativeDialog } from '../../testing/native-dialog-test';
import { FeedStockPage } from './feed-stock.page';

const balance = (overrides: Partial<FeedStockBalance> = {}): FeedStockBalance => ({ receta_id: 4, nombre_receta: 'Ponedora',
  estado_receta: 'active', up_id: 7, nombre_up: 'Norte', saldo_g: '250000', minimo_g: '300000',
  estado_stock: 'por_debajo', requiere_atencion: true, ...overrides });
const page = (data: FeedStockBalance[], current = 1, last = 1): PaginatedResponse<FeedStockBalance> => ({ data,
  links: { first: null, last: null, next: null, prev: null },
  meta: { current_page: current, last_page: last, per_page: 25, from: data.length ? 1 : null, to: data.length || null, total: data.length },
});

describe('FeedStockPage', () => {
  let restoreDialog: () => void;
  let admin: boolean;
  let permissions: string[];
  const api = {
    balances: vi.fn(), recipes: vi.fn(), balance: vi.fn(), setMinimum: vi.fn(),
  };
  beforeEach(() => {
    restoreDialog = stubNativeDialog(); admin = true; permissions = [];
    api.balances.mockReset().mockReturnValue(of(page([balance()])));
    api.recipes.mockReset().mockReturnValue(of([{ id: 4, nombre: 'Ponedora', estado: 'active' }, { id: 8, nombre: 'Iniciador', estado: 'inactive' }]));
    api.balance.mockReset().mockReturnValue(of({ data: balance({ receta_id: 8, nombre_receta: 'Iniciador', estado_receta: 'inactive', saldo_g: '0', minimo_g: null, estado_stock: 'sin_configurar', requiere_atencion: false }) }));
    api.setMinimum.mockReset().mockReturnValue(of({ data: balance() }));
    TestBed.configureTestingModule({ imports: [FeedStockPage], providers: [provideRouter([]),
      { provide: AuthStore, useValue: { isAdmin: () => admin, user: () => ({ permissions }) } },
      { provide: FeedStockApi, useValue: api },
      { provide: ProductionUnitsService, useValue: { listAll: () => of([{ id: 7, name: 'Norte' }, { id: 9, name: 'Sur' }]) } },
    ] });
  });
  afterEach(() => restoreDialog());

  const setup = async () => {
    const fixture = TestBed.createComponent(FeedStockPage);
    await fixture.whenStable(); fixture.detectChanges(); return fixture;
  };
  const openRow = (fixture: Awaited<ReturnType<typeof setup>>) => {
    (fixture.nativeElement.querySelector('.minimum-action') as HTMLButtonElement).click(); fixture.detectChanges();
  };

  it('shows server stock states, inactive recipes and signed, exact quantities', async () => {
    api.balances.mockReturnValue(of(page([
      balance(), balance({ receta_id: 5, estado_receta: 'inactive', saldo_g: '-1', minimo_g: null, estado_stock: 'sin_configurar', requiere_atencion: false }),
      balance({ receta_id: 6, saldo_g: '300000', estado_stock: 'en_minimo' }),
      balance({ receta_id: 7, saldo_g: '900000', estado_stock: 'suficiente', requiere_atencion: false }),
    ])));
    const fixture = await setup();
    expect(api.balances).toHaveBeenCalledWith({ up_id: 7, page: 1 });
    const text: string = fixture.nativeElement.textContent;
    for (const content of ['250 kg', '-0,001 kg', 'Inactiva', 'Sin configurar', 'En mínimo', 'Suficiente', '2 requieren atención en esta página']) expect(text).toContain(content);
  });

  it('keeps applied filters during pagination and starts again on a unit change', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.filters.setValue({ recipe: '4', attention: true }); component.applyFilters(); await fixture.whenStable();
    await component.load(2);
    expect(api.balances).toHaveBeenLastCalledWith({ up_id: 7, receta_id: 4, requiere_atencion: true, page: 2 });
    const selector = fixture.nativeElement.querySelector('#feed-stock-unit') as HTMLSelectElement;
    selector.value = '9'; selector.dispatchEvent(new Event('change')); await fixture.whenStable();
    expect(api.balances).toHaveBeenLastCalledWith({ up_id: 9, receta_id: 4, requiere_atencion: true, page: 1 });
    component.clearFilters(); await fixture.whenStable();
    expect(api.balances).toHaveBeenLastCalledWith({ up_id: 9, page: 1 });
  });

  it('discards late responses from a previous UP', async () => {
    const pending = new Subject<PaginatedResponse<FeedStockBalance>>();
    api.balances.mockReturnValueOnce(pending).mockReturnValue(of(page([balance({ up_id: 9, nombre_receta: 'Sur' })])));
    const fixture = TestBed.createComponent(FeedStockPage); fixture.detectChanges();
    await Promise.resolve();
    fixture.componentInstance.selectedUnit.set(9); await fixture.componentInstance.load();
    pending.next(page([balance({ nombre_receta: 'Respuesta anterior' })])); pending.complete();
    await fixture.whenStable();
    expect(fixture.componentInstance.balances()[0]?.nombre_receta).toBe('Sur');
  });

  it('edits and removes minimums without issuing a stock adjustment', async () => {
    const fixture = await setup(); openRow(fixture);
    const input = fixture.nativeElement.querySelector('#feed-minimum-value') as HTMLInputElement;
    expect(input.value).toBe('300');
    input.value = '300,001'; input.dispatchEvent(new Event('input'));
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('dialog form').dispatchEvent(submit);
    await fixture.whenStable();
    expect(submit.defaultPrevented).toBe(true);
    expect(api.setMinimum).toHaveBeenLastCalledWith(7, 4, '300001');
    fixture.detectChanges(); openRow(fixture);
    fixture.componentInstance.minimumValue.setValue(''); await fixture.componentInstance.saveMinimum();
    expect(api.setMinimum).toHaveBeenLastCalledWith(7, 4, null);
  });

  it('configures an inactive recipe without previous movements', async () => {
    api.balances.mockReturnValue(of(page([])));
    const fixture = await setup();
    (fixture.nativeElement.querySelector('.page-heading button') as HTMLButtonElement).click();
    const component = fixture.componentInstance;
    component.minimumRecipe.setValue('8'); await component.chooseMinimumRecipe();
    expect(api.balance).toHaveBeenCalledWith(7, 8);
    expect(component.minimumBalance()?.saldo_g).toBe('0');
    component.minimumValue.setValue('0'); await component.saveMinimum();
    expect(api.setMinimum).toHaveBeenCalledWith(7, 8, '0');
  });

  it('requires inventory.manage for editing, and avoids unauthorized recipe catalog calls', async () => {
    admin = false;
    const fixture = await setup();
    expect(api.recipes).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.minimum-action')).toBeNull();
    fixture.componentInstance.openMinimum(new Event('click'), balance());
    fixture.componentInstance.minimumBalance.set(balance()); await fixture.componentInstance.saveMinimum();
    expect(api.setMinimum).not.toHaveBeenCalled();
  });

  it('allows stock managers without recipe permission to edit existing accounts', async () => {
    admin = false; permissions = ['inventory.manage'];
    const fixture = await setup(); openRow(fixture);
    expect(api.recipes).not.toHaveBeenCalled();
    fixture.componentInstance.minimumValue.setValue('50'); await fixture.componentInstance.saveMinimum();
    expect(api.setMinimum).toHaveBeenCalledWith(7, 4, '50000');
  });

  it('rejects invalid amounts and keeps errors and retries inside the dialog', async () => {
    const fixture = await setup(); openRow(fixture); const component = fixture.componentInstance;
    for (const input of ['-1', '0.0001', '1000000000']) {
      component.minimumValue.setValue(input); await component.saveMinimum();
    }
    expect(api.setMinimum).not.toHaveBeenCalled();
    component.minimumValue.setValue('100');
    api.setMinimum.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { message: 'Mínimo inválido.' } })));
    await component.saveMinimum(); fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
    expect(component.minimumError()).toBe('Mínimo inválido.');
    await component.saveMinimum(); expect(component.minimumError()).toBeNull();
  });

  it('prevents duplicate saves and closing or changing UP while submitting', async () => {
    const pending = new Subject<{ data: FeedStockBalance }>();
    api.setMinimum.mockReturnValue(pending);
    const fixture = await setup(); openRow(fixture); const component = fixture.componentInstance;
    const saving = component.saveMinimum(); await component.saveMinimum(); component.closeMinimum();
    const selector = fixture.nativeElement.querySelector('#feed-stock-unit') as HTMLSelectElement;
    selector.value = '9'; selector.dispatchEvent(new Event('change'));
    expect(component.selectedUnit()).toBe(7);
    expect((fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
    expect(api.setMinimum).toHaveBeenCalledTimes(1);
    pending.next({ data: balance() }); pending.complete(); await saving;
  });

  it('discards a recipe lookup after closing the modal', async () => {
    const pending = new Subject<{ data: FeedStockBalance }>(); api.balance.mockReturnValue(pending);
    const fixture = await setup(); openRow(fixture); const component = fixture.componentInstance;
    component.minimumRecipe.setValue('8'); const loading = component.chooseMinimumRecipe(); component.closeMinimum();
    openRow(fixture); pending.next({ data: balance({ receta_id: 8 }) }); pending.complete(); await loading;
    expect(component.minimumBalance()?.receta_id).toBe(4);
  });

  it('offers recovery for server errors and does not display them as empty stock', async () => {
    api.balances.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    const fixture = await setup();
    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('No se pudo conectar');
    await fixture.componentInstance.load(); expect(fixture.componentInstance.state()).toBe('success');
  });

  it('shows pagination controls with the server page metadata', async () => {
    api.balances.mockReturnValue(of(page([balance()], 1, 2)));
    const fixture = await setup();
    const buttons = fixture.nativeElement.querySelectorAll('.pagination button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(true); expect(buttons[1].disabled).toBe(false);
    buttons[1].click(); await fixture.whenStable();
    expect(api.balances).toHaveBeenLastCalledWith(expect.objectContaining<Partial<FeedStockFilters>>({ page: 2 }));
  });
});
