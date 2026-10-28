import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { InventoryApi } from '../../services/inventory.api';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { AllowedStockProduct, PaginatedResponse, StockBalance, StockLocation } from '../../interfaces/inventory';
import { StockRegularizationDialogComponent } from './stock-regularization-dialog.component';

const source: StockLocation = { id: 1, name: 'Planta', type: 'feed_plant', allowed_product_kinds: ['raw_material'], status: 'active', system_managed: true };
const destination: StockLocation = { ...source, id: 23, name: 'Cámara', type: 'warehouse', allowed_product_kinds: ['supply', 'other'], system_managed: false };
const balance: StockBalance = {
  id: 8, product_id: 4, stock_location_id: 1, stock_location: source,
  product: { id: 4, name: 'Insumo', sku: 'INS', kind: 'supply', base_unit: 'unit', status: 'active', stock_tracked: true },
  available_quantity: '120.000000', minimum_quantity: '0', created_at: '', updated_at: '',
};
const paginated = <T>(data: T[], current_page = 1, last_page = 1): PaginatedResponse<T> => ({ data,
  links: { first: null, last: null, next: null, prev: null }, meta: { current_page, last_page, from: null, to: null, per_page: 100, total: data.length } });

describe('Historical stock regularization', () => {
  let fixture: ComponentFixture<StockRegularizationDialogComponent>;
  let api: { regularize: ReturnType<typeof vi.fn>; allowedProducts: ReturnType<typeof vi.fn> };
  let locations: ReturnType<typeof vi.fn>;
  const actor = signal({ id: 1, permissions: ['inventory.adjust'] });
  beforeEach(() => {
    stubNativeDialog(); actor.set({ id: 1, permissions: ['inventory.adjust'] });
    api = { regularize: vi.fn(() => of({ data: {} })), allowedProducts: vi.fn(() => of(paginated([{ ...balance.product, available_quantity: '0' }]))) };
    locations = vi.fn(() => of(paginated([source, destination])));
    TestBed.configureTestingModule({ imports: [StockRegularizationDialogComponent], providers: [
      { provide: AuthStore, useValue: { user: actor, isAdmin: () => false } },
      { provide: InventoryApi, useValue: api }, { provide: StockLocationsApi, useValue: { list: locations } },
    ] });
    fixture = TestBed.createComponent(StockRegularizationDialogComponent); fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());
  async function settle() { await fixture.whenStable(); fixture.detectChanges(); }
  async function open(item = balance) { const page = fixture.componentInstance; page.open(item, null); await settle(); return page; }
  async function prepareTransfer() {
    const page = await open();
    page.form.patchValue({ destination: '23', quantity: '12', reason: '  Ubicación corregida  ' }); await settle(); return page;
  }

  it('offers only compatible destinations, checks the product and requires a separate confirmation', async () => {
    const page = await prepareTransfer();
    expect(page.destinationOptions().map((item) => item.value)).toEqual([23]);
    expect(api.allowedProducts).toHaveBeenCalledWith({ stock_location_id: 23, operation: 'transfer', per_page: 100, page: 1 });
    page.review(); fixture.detectChanges();
    expect(api.regularize).not.toHaveBeenCalled(); expect(page.reviewSummary()).toContain('12 unidades');
    await page.confirm();
    expect(api.regularize).toHaveBeenCalledWith(8, { mode: 'trasladar', reason: 'Ubicación corregida', quantity: '12', to_stock_location_id: 23 }, expect.any(String));
    expect((fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBe(false);
  });

  it('rejects fractional discrete quantities, excess stock and blank reasons before confirmation', async () => {
    const page = await prepareTransfer();
    for (const quantity of ['0', '1,5', '121', '1000000000000']) {
      page.form.controls.quantity.setValue(quantity); page.review(); expect(page.step()).toBe('form');
    }
    page.form.patchValue({ quantity: '2', reason: '   ' }); page.review();
    expect(page.error()).toContain('motivo'); expect(api.regularize).not.toHaveBeenCalled();
  });

  it('can close an inactive historical product and negative balance to zero without inventing a destination', async () => {
    const page = await open({ ...balance, available_quantity: '-2', product: { ...balance.product, status: 'inactive', stock_tracked: false } });
    expect(page.canTransfer()).toBe(false); expect(locations).not.toHaveBeenCalled();
    page.form.controls.reason.setValue('Recuento verificado'); page.review();
    expect(page.reviewSummary()).toContain('-2 unidades a cero');
    await page.confirm(); expect(api.regularize.mock.calls[0][1]).toEqual({ mode: 'recontar', reason: 'Recuento verificado' });
  });

  it.each([0, 200, 503])('retains the exact command and idempotency key after an uncertain response (%i) and blocks closing', async (status) => {
    const page = await prepareTransfer(); page.review();
    api.regularize.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
    await page.confirm(); const [id, body, key] = api.regularize.mock.calls[0];
    expect(page.uncertain()).toBe(true); page.cancel(); page.edit();
    expect(page.step()).toBe('confirm'); expect((fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
    await page.confirm(); expect(api.regularize).toHaveBeenLastCalledWith(id, body, key);
  });

  it('allows revising a rejected command after a definitive conflict', async () => {
    const page = await prepareTransfer(); page.review();
    api.regularize.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'El saldo cambió.' } })));
    await page.confirm(); expect(page.error()).toBe('El saldo cambió.'); expect(page.uncertain()).toBe(false);
    page.edit(); expect(page.step()).toBe('form'); expect(api.regularize).toHaveBeenCalledTimes(1);
  });

  it('does not accept an unverified destination or a late check for an old destination', async () => {
    const page = await open(); const pending = new Subject<PaginatedResponse<AllowedStockProduct>>();
    api.allowedProducts.mockReturnValue(pending.asObservable());
    page.form.patchValue({ destination: '23', quantity: '1', reason: 'Revisión' });
    page.review(); expect(page.step()).toBe('form');
    page.form.controls.destination.setValue('999'); pending.next(paginated([{ ...balance.product, available_quantity: '0' }])); await settle();
    expect(page.destinationState()).toBe('idle'); page.review(); expect(api.regularize).not.toHaveBeenCalled();
  });

  it('blocks unauthorized users and eggs, and ignores a previous actor’s result', async () => {
    actor.set({ id: 1, permissions: [] }); fixture.detectChanges();
    fixture.componentInstance.open(balance, null); expect(fixture.componentInstance.balance()).toBeNull();
    actor.set({ id: 1, permissions: ['inventory.adjust'] }); fixture.detectChanges();
    fixture.componentInstance.open({ ...balance, product: { ...balance.product, kind: 'egg' } }, null);
    expect(fixture.componentInstance.balance()).toBeNull();
    const page = await prepareTransfer(); page.review(); const pending = new Subject<{ data: object }>(); api.regularize.mockReturnValue(pending.asObservable());
    const done = vi.fn(); page.regularized.subscribe(done); const request = page.confirm();
    actor.set({ id: 2, permissions: ['inventory.adjust'] }); fixture.detectChanges();
    pending.next({ data: {} }); await request; expect(done).not.toHaveBeenCalled(); expect(page.balance()).toBeNull();
  });
});
