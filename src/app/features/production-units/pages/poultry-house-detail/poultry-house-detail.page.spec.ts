import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { PoultryHouseDetailPage } from './poultry-house-detail.page';
import { FlockDetailService } from '../../../flocks/services/flock-detail.service';

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
    expect(fixture.nativeElement.querySelector('.add-trigger')?.getAttribute('aria-label')).toBe('Agregar ingrediente');
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

  it('opens the ingredient form from the header plus, exposes its state and cancels without writing stock', async () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', status: 'operational' } }));
    render();
    const trigger = fixture.nativeElement.querySelector('.section-heading button') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-label')).toBe('Agregar ingrediente');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.ingredient-form')).toBeNull();
    trigger.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(inventoryIngredients).toHaveBeenCalledOnce();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('ingredient-form');
    expect(trigger.getAttribute('aria-label')).toBe('Cerrar formulario de ingrediente');
    const form = fixture.nativeElement.querySelector('.ingredient-form') as HTMLFormElement;
    expect(form.nextElementSibling?.querySelector('.manufacture-button')).not.toBeNull();
    const cancel = form.querySelector('ion-button[type="button"]') as HTMLElement;
    expect(cancel.textContent).toContain('Cancelar');
    cancel.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.ingredient-form')).toBeNull();
    expect(createFeedIngredient).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('disables Elaborar for nonoperational plants and explains why', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed' } }));
    render();
    expect(fixture.nativeElement.querySelector('.manufacture-button')?.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('La planta debe estar operativa');
  });

  it('loads initial stock only from a selected inventory ingredient without editable SKU or name', () => {
    getPoultryHouseById.mockReturnValue(of({ data: { ...house, type: 'feed', bird_capacity: null, current_occupancy: null } }));
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
