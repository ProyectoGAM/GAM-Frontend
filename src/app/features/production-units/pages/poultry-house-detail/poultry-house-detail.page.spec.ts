import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { PoultryHouseDetailPage } from './poultry-house-detail.page';

describe('PoultryHouseDetailPage', () => {
  let fixture: ComponentFixture<PoultryHouseDetailPage>;
  let getPoultryHouseById: ReturnType<typeof vi.fn>;
  let houseFlocks: ReturnType<typeof vi.fn>;
  let feedStock: ReturnType<typeof vi.fn>;
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
    updatePoultryHouseStatus = vi.fn().mockReturnValue(of({ data: { ...house, status: 'inactive' } }));
    alertCreate = vi.fn().mockResolvedValue({
      present: vi.fn(),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    });
    TestBed.configureTestingModule({
      imports: [PoultryHouseDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7', houseId: '22' }) } } },
        { provide: ProductionUnitsService, useValue: { getPoultryHouseById, houseFlocks, feedStock, updatePoultryHouseStatus } },
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
    expect(unitLink.getAttribute('href')).toBe('/administracion/ubicaciones/unidades-productivas/7');
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
      .toBe('/administracion/ubicaciones/unidades-productivas/7');
    expect(fixture.nativeElement.textContent).toContain('Stock de ingredientes');
    expect(fixture.nativeElement.textContent).toContain('Agregar ingrediente');
    expect(fixture.nativeElement.textContent).not.toContain('Ubicación');
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
});
