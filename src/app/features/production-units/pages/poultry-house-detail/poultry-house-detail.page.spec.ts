import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AlertController, IonModal } from '@ionic/angular';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';

import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { PoultryHouseDetailPage } from './poultry-house-detail.page';
import { FlockDetailService } from '../../../flocks/services/flock-detail.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedAdjustmentService } from '../../services/feed-adjustment.service';
import { FeedStockDetailComponent } from '../../components/feed-stock-detail/feed-stock-detail.component';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { FlockHealthService } from '../../../flocks/services/flock-health.service';
import { ManagementPlansService } from '../../../management-plans/services/management-plans.service';
import { HealthApplicationComponent } from '../../../flocks/components/health-application/health-application.component';
import { HealthOperation } from '../../../flocks/interfaces/flock-health.interface';
import { healthFlock, healthPlan } from '../../../flocks/testing/health-fixtures';

describe('PoultryHouseDetailPage', () => {
  let fixture: ComponentFixture<PoultryHouseDetailPage>;
  let getPoultryHouseById: ReturnType<typeof vi.fn>;
  let houseFlocks: ReturnType<typeof vi.fn>;
  let feedStock: ReturnType<typeof vi.fn>;
  let inventoryIngredients: ReturnType<typeof vi.fn>;
  let createFeedIngredient: ReturnType<typeof vi.fn>;
  let updatePoultryHouseStatus: ReturnType<typeof vi.fn>;
  let alertCreate: ReturnType<typeof vi.fn>;

  const house: PoultryHouseDetail = {
    id: 22,
    production_unit_id: 7,
    name: 'Galpón Lotes Cuarentena Demo',
    type: 'poultry',
    status: 'maintenance',
    bird_capacity: 6000,
    current_occupancy: 750,
    production_unit: {
      id: 7,
      name: 'Granja Norte',
      status: 'active',
      locality: {
        id: 8,
        department_id: 9,
        name: 'Pando',
        department: { id: 9, name: 'Canelones' },
      },
    },
  };

  beforeEach(() => {
    getPoultryHouseById = vi.fn().mockReturnValue(of({ data: house }));
    houseFlocks = vi.fn().mockReturnValue(of([]));
    feedStock = vi.fn().mockReturnValue(of({ data: { scope: 'plant', scope_id: 23, items: [] } }));
    inventoryIngredients = vi.fn().mockReturnValue(of([]));
    createFeedIngredient = vi.fn().mockReturnValue(of({ data: {} }));
    updatePoultryHouseStatus = vi.fn().mockReturnValue(of({ data: { ...house, status: 'inactive' } }));
    alertCreate = vi.fn().mockResolvedValue({
      present: vi.fn(),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    });
    TestBed.configureTestingModule({
      imports: [PoultryHouseDetailPage],
      providers: [
        provideRouter([]),
        { provide: FlockDetailService, useValue: { mortalityTotals: () => of(new Map()) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7', houseId: '22' }) } } },
        { provide: ProductionUnitsService, useValue: { getPoultryHouseById, houseFlocks, feedStock, inventoryIngredients, createFeedIngredient, updatePoultryHouseStatus } },
        { provide: AlertController, useValue: { create: alertCreate } },
        { provide: AuthStore, useValue: { user: () => ({ id: 1 }), session: () => null } },
        { provide: FeedAdjustmentService, useValue: { readPending: () => null } },
      ],
    });
  });

  function render(): void {
    fixture = TestBed.createComponent(PoultryHouseDetailPage);
    fixture.detectChanges();
  }

  it('loads the selected house, verifies its parent and shows its capacity and status', () => {
    render();

    expect(getPoultryHouseById).toHaveBeenCalledWith(22);
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Galpón Lotes Cuarentena Demo');
    expect(fixture.nativeElement.textContent).toContain('En mantenimiento');
    expect(fixture.nativeElement.textContent).toContain('6.000 aves');
    expect(fixture.nativeElement.textContent).toContain('750 aves');
    expect(fixture.nativeElement.textContent).toContain('Granja Norte');
    expect(fixture.nativeElement.textContent).toContain('Pando, Canelones');
    expect(fixture.nativeElement.textContent).toContain('Ver unidad productiva');
    expect(fixture.nativeElement.textContent).toContain('Lote alojado');
    expect(fixture.nativeElement.textContent).toContain('Galpón vacío');

    const backLink = fixture.nativeElement.querySelector('.back-link');
    const unitLink = fixture.nativeElement.querySelector('.unit-link');
    expect(backLink.getAttribute('href')).toBe('/administracion/ubicaciones/galpones');
    expect(backLink.textContent).toContain('Volver a galpones');
    expect(unitLink.getAttribute('href')).toBe('/administracion/unidades-productivas/7');
  });

  it('opens lot creation with the empty operational house and its UP selected', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, status: 'operational', current_occupancy: 0 } }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    render();

    const addButton = fixture.nativeElement.querySelector('app-poultry-house-detail-content ion-button.action');
    expect(addButton?.textContent).toContain('Agregar lote');
    addButton.click();

    expect(navigate).toHaveBeenCalledWith(['/administracion/lotes/lotes/nuevo'], {
      queryParams: { unitId: 7, houseId: 22 },
    });
  });

  it('shows excess, real percentage and zero free places while keeping the bar within its range', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, current_occupancy: 6200 } }));
    render();
    const warning = fixture.nativeElement.querySelector('.capacity-warning');
    expect(warning.textContent).toContain('Se está sobrepasando el límite del galpón');
    expect(warning.textContent).toContain('Se excede en 200 aves.');
    expect(fixture.nativeElement.querySelector('.occupancy-copy').textContent).toContain('103 %');
    const progress = fixture.nativeElement.querySelector('.progress');
    expect(progress.getAttribute('aria-valuenow')).toBe('100');
    expect(progress.getAttribute('aria-valuetext')).toBe('103 % de ocupación');
    expect(progress.querySelector('span').style.width).toBe('100%');
    expect(fixture.componentInstance.availableCapacityLabel()).toBe('0 plazas');
    fixture.componentInstance.house.set({ ...house, current_occupancy: 6000 }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.capacity-warning')).toBeNull();
    expect(fixture.nativeElement.querySelector('.occupancy-copy').textContent).toContain('100 %');
  });

  it('does not offer lot creation when the house is not operational', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, current_occupancy: 0 } }));
    render();
    expect(fixture.nativeElement.textContent).toContain('Galpón vacío');
    expect(fixture.nativeElement.textContent).not.toContain('Agregar lote');
  });

  it('uses the same lot card with admission, grouping, status, mortality and live birds inside a house', async () => {
    houseFlocks.mockReturnValue(of([{ id: 'lot-1', code: 'LOTE-AGRUPADO', poultry_house_id: 22,
      current_quantity: 750, current_week: 3, entry_date: '2026-10-01', is_grouped: true, status: 'quarantined' }]));
    TestBed.overrideProvider(FlockDetailService, { useValue: {
      mortalityTotals: () => of(new Map([['lot-1', { state: 'ready', value: 9 }]])),
    } });
    render(); await fixture.whenStable(); fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('app-flock-card') as HTMLElement;
    expect(card.textContent).toContain('LOTE-AGRUPADO');
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/administracion/lotes/lotes/lot-1?lotFrom=house&unitId=7&houseId=22');
    expect(card.textContent).toContain('Ingreso: 01-10-2026');
    expect(card.textContent).toContain('Agrupado');
    expect(card.textContent).toContain('En cuarentena');
    expect(card.querySelectorAll('dd')[0].textContent).toBe('9');
    expect(card.querySelectorAll('dd')[1].textContent).toBe('750');
  });

  it('does not show a house when it does not belong to the unit in the route', () => {
    getPoultryHouseById.mockReturnValue(of({
      data: {
        ...house,
        production_unit_id: 8,
        production_unit: { ...house.production_unit, id: 8 },
      },
    }));

    render();

    expect(fixture.nativeElement.textContent).toContain('La instalación solicitada no existe o no pertenece a esa unidad productiva.');
    expect(fixture.nativeElement.textContent).not.toContain(house.name);
  });

  it('handles task buttons locally and restores focus on cancellation without reloading or navigating', async () => {
    houseFlocks.mockReturnValue(of([{ id: 'lot-1', code: 'LOTE', poultry_house_id: 22,
      current_quantity: 750, entry_date: '2026-10-01', is_grouped: false, status: 'active' }]));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    render(); await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll('app-flock-card button.task-link') as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    expect(fixture.componentInstance.flockTask()).toMatchObject({ kind: 'mortality', flockId: 'lot-1', origin: { unitId: 7, houseId: 22 } });
    fixture.componentInstance.closeFlockTask(null);
    await fixture.whenStable();
    expect(fixture.componentInstance.flockTask()).toBeNull(); expect(navigate).not.toHaveBeenCalled();
    expect(houseFlocks).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(buttons[0]);
    buttons[1].click(); expect(fixture.componentInstance.flockTask()?.kind).toBe('feeding');
    fixture.componentInstance.closeFlockTask(null);
  });

  it('refreshes occupancy, live birds and mortality totals after a modal save while keeping the house visible', async () => {
    const flock = { id: 'lot-1', code: 'LOTE', poultry_house_id: 22,
      current_quantity: 750, entry_date: '2026-10-01', is_grouped: false, status: 'active' };
    const totals = vi.fn(() => of(new Map([['lot-1', { state: 'ready', value: 9 }]])));
    houseFlocks.mockReturnValue(of([flock]));
    TestBed.overrideProvider(FlockDetailService, { useValue: { mortalityTotals: totals } });
    render(); await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('app-flock-card button.task-link') as HTMLButtonElement;
    button.click();
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, current_occupancy: 749 } }));
    houseFlocks.mockReturnValue(of([{ ...flock, current_quantity: 749 }]));
    totals.mockReturnValue(of(new Map([['lot-1', { state: 'ready', value: 10 }]])));
    fixture.componentInstance.closeFlockTask('Mortandad registrada.');
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('success'); expect(fixture.componentInstance.occupancyLabel()).toBe('749 aves');
    const counts = fixture.nativeElement.querySelectorAll('app-flock-card dd') as NodeListOf<HTMLElement>;
    expect(counts[0].textContent).toBe('10'); expect(counts[1].textContent).toBe('749');
    expect(totals).toHaveBeenCalledTimes(2); expect(fixture.nativeElement.textContent).toContain('Mortandad registrada.');
  });

  it('opens Sanidad from the house card, blocks leaving during save and refreshes the same detail on success', async () => {
    const restore = stubNativeDialog();
    const pending = new Subject<HealthOperation>();
    const record = vi.fn(() => pending); const history = vi.fn();
    const actor = { id: 1, name: 'María', roles: ['admin'], permissions: [] };
    const flock = { ...healthFlock, poultry_house_id: 22, production_unit_id: 7 };
    houseFlocks.mockReturnValue(of([flock]));
    TestBed.overrideProvider(AuthStore, { useValue: { user: () => actor, session: () => null } });
    TestBed.overrideProvider(FlockDetailService, { useValue: { flock: () => of(flock), mortalityTotals: () => of(new Map()) } });
    TestBed.configureTestingModule({ providers: [
      { provide: FlockHealthService, useValue: { record, history } },
      { provide: ManagementPlansService, useValue: { catalogOptions: async () => [{ value: 'vaccine-1', label: 'Vacuna A' }], flockPlan: () => of({ data: healthPlan }) } },
    ] });
    try {
      render(); await fixture.whenStable(); fixture.detectChanges();
      const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.task-link')]
        .find((item) => item.textContent?.includes('Sanidad'))!;
      expect(button).toBeDefined(); button.click(); fixture.detectChanges();
      await vi.waitFor(async () => {
        await fixture.whenStable(); fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.health-dialog')?.open).toBe(true);
      });
      expect(fixture.nativeElement.querySelector('app-flock-house-task-dialog')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain(house.name);
      expect(history).not.toHaveBeenCalled(); expect(TestBed.inject(Router).url).toBe('/');
      const editor = fixture.debugElement.query(By.directive(HealthApplicationComponent)).componentInstance as HealthApplicationComponent;
      editor.submitted.emit({ kind: 'vaccination', body: { vaccine_id: 'vaccine-1', occurred_at: '2026-10-20T10:00:00-03:00', reason: 'Indicación' } });
      expect(fixture.componentInstance.canLeave()).toBe(false);
      pending.next({ operation_id: 'op-1', vaccination_application: { id: 'app-1' } }); pending.complete();
      await vi.waitFor(async () => {
        await fixture.whenStable(); fixture.detectChanges();
        expect(fixture.componentInstance.taskMessage()).toBe('Aplicación registrada.');
      });
      expect(fixture.componentInstance.flockTask()).toBeNull();
      expect(fixture.componentInstance.canLeave()).toBe(true);
      expect(houseFlocks).toHaveBeenCalledTimes(2);
      expect(document.activeElement?.textContent).toContain('Sanidad');
      expect(TestBed.inject(Router).url).toBe('/');
    } finally { fixture?.destroy(); restore(); }
  });

  it('renders feed stock without avian sections', () => {
    getPoultryHouseById.mockReturnValue(of({
      data: {
        ...house,
        id: 23,
        name: 'Planta Norte',
        type: 'feed',
        bird_capacity: null,
      },
    }));

    render();

    expect(fixture.nativeElement.textContent).toContain('Planta de ración');
    expect(fixture.nativeElement.querySelector('#capacity-title')).toBeNull();
    expect(fixture.nativeElement.querySelector('#flock-title')).toBeNull();
    expect(fixture.nativeElement.querySelector('.back-link')?.textContent).toContain('Volver a la unidad productiva');
    expect(fixture.nativeElement.querySelector('.back-link')?.getAttribute('href'))
      .toBe('/administracion/unidades-productivas/7');
    expect(fixture.nativeElement.textContent).toContain('Stock de ingredientes');
    expect(fixture.nativeElement.querySelector('.product-trigger')?.textContent).toContain('Agregar Producto');
    expect(fixture.nativeElement.textContent).not.toContain('Ubicación');
  });

  it('keeps Elaborar at the end and opens the selected operational plant', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', status: 'operational' } }));
    feedStock.mockReturnValue(of({ data: { scope: 'plant', scope_id: 22, items: [
      { product_id: 1, product: { id: 1, sku: 'MAIZ-1', name: 'Maíz' }, total_g: '1000', is_negative: false, details: [] },
    ] } }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    render();
    const actions = fixture.nativeElement.querySelector('.add-content') as HTMLElement;
    const button = actions.querySelector('.manufacture-button') as HTMLElement;
    expect(actions.lastElementChild?.contains(button)).toBe(true);
    expect(button.textContent).toContain('Elaborar');
    button.click();
    expect(navigate).toHaveBeenCalledWith(['/administracion/unidades-productivas', 7, 'galpon', 22, 'elaborar']);
  });

  it('opens the product modal above Elaborar and cancels without writing stock', async () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', status: 'operational' } }));
    render();
    const trigger = fixture.nativeElement.querySelector('.product-trigger') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Agregar Producto');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.ingredient-form')).toBeNull();
    trigger.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(inventoryIngredients).toHaveBeenCalledOnce();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('ingredient-modal');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.textContent).toContain('Agregar Producto');
    const modal = fixture.debugElement.query(By.directive(IonModal));
    expect(modal.componentInstance.isOpen).toBe(true);
    const form = fixture.nativeElement.querySelector('.ingredient-form') as HTMLFormElement;
    expect(form.closest('ion-modal')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.stock-layout .ingredient-form')).toBeNull();
    const cancel = form.querySelector('ion-button[type="button"]') as HTMLElement;
    expect(cancel.textContent).toContain('Cancelar');
    cancel.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.ingredient-form')).toBeNull();
    expect(createFeedIngredient).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('shows both stock actions above Elaborar and opens the adjustment modal without catalog or stock writes', async () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', status: 'operational' } }));
    render();
    const actions = fixture.nativeElement.querySelector('.stock-actions') as HTMLElement;
    expect(actions.textContent).toContain('Agregar Producto');
    expect(actions.textContent).toContain('Ajustar Stock');
    expect(actions.nextElementSibling?.querySelector('.manufacture-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.add-trigger')).toBeNull();
    const stockRequests = feedStock.mock.calls.length;
    (actions.querySelector('.adjustment-trigger') as HTMLButtonElement).click();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const modal = fixture.debugElement.query(By.css('#stock-adjustment-modal'));
    expect(modal.componentInstance.isOpen).toBe(true);
    expect(modal.nativeElement.textContent).toContain('Esta planta no tiene materias primas registradas para ajustar.');
    expect(inventoryIngredients).not.toHaveBeenCalled();
    expect(createFeedIngredient).not.toHaveBeenCalled();
    expect(feedStock).toHaveBeenCalledTimes(stockRequests);
    (modal.nativeElement.querySelector('button[aria-label="Cerrar ajuste de stock"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(modal.componentInstance.isOpen).toBe(false);
    modal.triggerEventHandler('didDismiss', undefined);
    expect(document.activeElement).toBe(actions.querySelector('.adjustment-trigger'));
  });

  it('keeps the modal open while saving and synchronizes dismissal without reopening it after success', async () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', status: 'operational' } }));
    inventoryIngredients.mockReturnValue(of([
      { id: 2, sku: 'SOJA-1', name: 'Harina de soja', kind: 'raw_material', base_unit: 'g', status: 'active', stock_tracked: true },
    ]));
    const response = new Subject<object>();
    createFeedIngredient.mockReturnValue(response);
    render();
    fixture.componentInstance.toggleIngredientForm();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const modal = fixture.debugElement.query(By.directive(IonModal));
    fixture.componentInstance.ingredientForm.setValue({ productId: 2, quantity: '50', unit: 'kg' });
    fixture.componentInstance.addIngredient(); fixture.detectChanges();
    expect(modal.componentInstance.canDismiss).toBe(false);
    fixture.componentInstance.toggleIngredientForm();
    expect(fixture.componentInstance.ingredientFormOpen()).toBe(true);
    response.next({}); fixture.detectChanges();
    expect(modal.componentInstance.isOpen).toBe(false);
    expect(modal.componentInstance.canDismiss).toBe(true);
    modal.triggerEventHandler('didDismiss'); fixture.detectChanges();
    expect(fixture.componentInstance.ingredientFormOpen()).toBe(false);
    expect(createFeedIngredient).toHaveBeenCalledOnce();
    fixture.componentInstance.toggleIngredientForm(); fixture.detectChanges();
    modal.triggerEventHandler('didDismiss'); fixture.detectChanges();
    expect(fixture.componentInstance.ingredientFormOpen()).toBe(false);
  });

  it('disables Elaborar for nonoperational plants and explains why', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed' } }));
    render();
    expect(fixture.nativeElement.querySelector('.manufacture-button')?.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('La planta debe estar operativa');
  });

  it.each(['maintenance', 'out_of_service', 'inactive'] as const)('disables stock actions and prevents opening or adding ingredients for a %s plant', (status) => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', status } }));
    render();
    const page = fixture.componentInstance;
    const stock = fixture.debugElement.query(By.directive(FeedStockDetailComponent)).componentInstance as FeedStockDetailComponent;
    const triggers = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.stock-action')];
    expect(triggers).toHaveLength(2);
    expect(triggers.every((button) => button.disabled)).toBe(true);
    triggers.forEach((button) => button.click());
    stock.openIngredientForm(); stock.openAdjustment(); page.toggleIngredientForm();
    expect(page.ingredientFormOpen()).toBe(false);
    expect(stock.adjustmentOpen()).toBe(false);
    expect(inventoryIngredients).not.toHaveBeenCalled();
    page.inventoryIngredients.set([{ id: 2, sku: 'SOJA-1', name: 'Soja', kind: 'raw_material', base_unit: 'g', status: 'active', stock_tracked: true }]);
    page.catalogState.set('success');
    page.ingredientForm.setValue({ productId: 2, quantity: '50', unit: 'kg' });
    page.addIngredient();
    expect(createFeedIngredient).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('operativa para agregar ingredientes, ajustar stock');
    page.house.set({ ...page.house()!, status: 'operational' }); fixture.detectChanges();
    expect(triggers.every((button) => !button.disabled)).toBe(true);
  });

  it('blocks saving an open ingredient form after the plant stops operating, while allowing it to close', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', status: 'operational' } }));
    inventoryIngredients.mockReturnValue(of([{ id: 2, sku: 'SOJA-1', name: 'Soja', kind: 'raw_material', base_unit: 'g', status: 'active', stock_tracked: true }]));
    render();
    const page = fixture.componentInstance;
    page.toggleIngredientForm(); fixture.detectChanges();
    page.ingredientForm.setValue({ productId: 2, quantity: '50', unit: 'kg' });
    page.house.set({ ...page.house()!, status: 'maintenance' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.save-button')?.disabled).toBe(true);
    page.addIngredient();
    expect(createFeedIngredient).not.toHaveBeenCalled();
    page.toggleIngredientForm();
    expect(page.ingredientFormOpen()).toBe(false);
  });

  it('loads initial stock only from a selected inventory ingredient without editable SKU or name', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', status: 'operational', bird_capacity: null, current_occupancy: null } }));
    feedStock.mockReturnValue(of({ data: {
      scope: 'plant', scope_id: 22,
      items: [{ product_id: 1, product: { id: 1, sku: 'MAIZ-1', name: 'Maíz' }, total_g: '1000', is_negative: false, details: [] }],
    } }));
    inventoryIngredients.mockReturnValue(of([
      { id: 1, sku: 'MAIZ-1', name: 'Maíz', kind: 'raw_material', base_unit: 'g', status: 'active', stock_tracked: true },
      { id: 2, sku: 'SOJA-1', name: 'Harina de soja', kind: 'raw_material', base_unit: 'g', status: 'active', stock_tracked: true },
    ]));
    render();

    fixture.componentInstance.toggleIngredientForm();
    fixture.detectChanges();

    expect(inventoryIngredients).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('ion-input[formControlName="sku"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-input[formControlName="name"]')).toBeNull();
    const ingredientOptions = fixture.nativeElement.querySelectorAll('ion-select[formControlName="productId"] ion-select-option');
    expect(ingredientOptions).toHaveLength(1);
    expect(ingredientOptions[0].textContent).toContain('Harina de soja');
    expect(fixture.nativeElement.textContent).not.toContain('Consultá al administrador');

    fixture.componentInstance.ingredientForm.setValue({ productId: 2, quantity: '50', unit: 'kg' });
    fixture.componentInstance.addIngredient();

    expect(createFeedIngredient).toHaveBeenCalledWith(22, {
      sku: 'SOJA-1', nombre: 'Harina de soja', cantidad: '50', unidad: 'kg',
    }, expect.any(String));
    expect(fixture.componentInstance.ingredientFormOpen()).toBe(false);
  });

  it('blocks deactivation while there are birds housed and exposes an information control', () => {
    render();

    expect(fixture.componentInstance.canDelete()).toBe(false);
    expect(fixture.nativeElement.querySelector('.reason-trigger ion-icon')?.getAttribute('name'))
      .toBe('information-circle-outline');
    expect(fixture.nativeElement.querySelector('.reason-trigger')?.getAttribute('aria-label'))
      .toContain('Por qué no se puede eliminar');
  });

  it('allows logical deactivation for an empty poultry house and feed plant', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, current_occupancy: 0 } }));
    render();
    expect(fixture.componentInstance.canDelete()).toBe(true);

    fixture.destroy();
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', bird_capacity: null, current_occupancy: null } }));
    render();
    expect(fixture.componentInstance.canDelete()).toBe(true);
  });

  it('confirms and applies logical deactivation when the house is empty', async () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, current_occupancy: 0 } }));
    render();

    await fixture.componentInstance.deactivate();

    expect(alertCreate).toHaveBeenCalledOnce();
    expect(updatePoultryHouseStatus).toHaveBeenCalledWith(22, 'inactive');
    expect(fixture.componentInstance.house()?.status).toBe('inactive');
  });

  it('does not open confirmation or deactivate while the house is occupied', async () => {
    render();

    await fixture.componentInstance.deactivate();

    expect(alertCreate).not.toHaveBeenCalled();
    expect(updatePoultryHouseStatus).not.toHaveBeenCalled();
  });

  it('changes the operational state through the dedicated status action', async () => {
    alertCreate.mockResolvedValue({
      present: vi.fn(),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm', data: { values: 'operational' } }),
    });
    render();

    await fixture.componentInstance.changeStatus();

    expect(updatePoultryHouseStatus).toHaveBeenCalledWith(22, 'operational');
    expect(getPoultryHouseById).toHaveBeenCalledTimes(2);
  });
});
