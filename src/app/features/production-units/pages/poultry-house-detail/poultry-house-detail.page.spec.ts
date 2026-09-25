import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { PoultryHouseDetailPage } from './poultry-house-detail.page';

describe('PoultryHouseDetailPage', () => {
  let fixture: ComponentFixture<PoultryHouseDetailPage>;
  let getPoultryHouseById: ReturnType<typeof vi.fn>;

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
    TestBed.configureTestingModule({
      imports: [PoultryHouseDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7', houseId: '22' }) } } },
        { provide: ProductionUnitsService, useValue: { getPoultryHouseById } },
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
    expect(fixture.nativeElement.textContent).toContain('Granja Norte');
    expect(fixture.nativeElement.textContent).toContain('Pando, Canelones');

    const backLink = fixture.nativeElement.querySelector('.back-link');
    const unitLink = fixture.nativeElement.querySelector('.detail-card a');
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

  it('renders feed installation capacity as not applicable', () => {
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
    expect(fixture.nativeElement.textContent).toContain('No aplica');
    expect(fixture.nativeElement.querySelector('.back-link')?.textContent).toContain('Volver a la unidad productiva');
    expect(fixture.nativeElement.querySelector('.back-link')?.getAttribute('href'))
      .toBe('/administracion/ubicaciones/unidades-productivas/7');
  });
});
