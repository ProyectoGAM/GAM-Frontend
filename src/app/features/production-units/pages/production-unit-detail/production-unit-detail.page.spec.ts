import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { PoultryHouse } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { ProductionUnitDetailPage } from './production-unit-detail.page';

describe('ProductionUnitDetailPage', () => {
  let fixture: ComponentFixture<ProductionUnitDetailPage>;
  let poultryHouses: ReturnType<typeof vi.fn>;

  const houses: PoultryHouse[] = [
    { id: 1, name: 'Galpón Este', type: 'poultry', status: 'operational', bird_capacity: 2000, current_occupancy: 10 },
    { id: 2, name: 'Planta Norte', type: 'feed', status: 'maintenance', bird_capacity: null, current_occupancy: null },
    { id: 3, name: 'Galpón Sur', type: 'poultry', status: 'inactive', bird_capacity: 1500, current_occupancy: 0 },
    { id: 4, name: 'Planta Sur', type: 'feed', status: 'inactive', bird_capacity: null, current_occupancy: null },
  ];

  beforeEach(() => {
    poultryHouses = vi.fn().mockReturnValue(of(houses));
    TestBed.configureTestingModule({
      imports: [ProductionUnitDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
        { provide: AlertController, useValue: {} },
        {
          provide: ProductionUnitsService,
          useValue: {
            getById: vi.fn().mockReturnValue(of({ data: {
              id: 7,
              name: 'Granja Norte',
              status: 'active',
              locality: { name: 'Pando', department: { name: 'Canelones' } },
            } })),
            poultryHouses,
          },
        },
      ],
    });
  });

  function render(): void {
    fixture = TestBed.createComponent(ProductionUnitDetailPage);
    fixture.detectChanges();
  }

  it('lists both types in active and inactive grids and shows occupancy only for poultry houses', () => {
    render();

    const active = fixture.nativeElement.querySelector('[aria-labelledby="active-houses-title"]');
    const inactive = fixture.nativeElement.querySelector('[aria-labelledby="inactive-houses-title"]');
    expect(active.querySelectorAll('a.house-link')).toHaveLength(2);
    expect(inactive.querySelectorAll('a.house-link')).toHaveLength(2);

    const poultryLink = active.querySelector('a[aria-label="Ver galpón avícola Galpón Este"]');
    expect(poultryLink.textContent).toContain('Galpón avícola');
    expect(poultryLink.textContent).toContain('10 / 2000 aves');

    const feedLink = active.querySelector('a[aria-label="Ver planta de ración Planta Norte"]');
    expect(feedLink.getAttribute('href')).toBe('/administracion/ubicaciones/unidades-productivas/7/galpon/2');
    expect(feedLink.textContent).toContain('Planta de ración');
    expect(feedLink.textContent).toContain('En mantenimiento');
    expect(feedLink.querySelector('.capacity')).toBeNull();
    expect(inactive.textContent).toContain('Galpón Sur');
    expect(inactive.textContent).toContain('Planta Sur');
  });

  it('requires plants as well as poultry houses to be inactive before disabling the unit', () => {
    render();
    expect(fixture.componentInstance.canChangeStatus()).toBe(false);

    poultryHouses.mockReturnValue(of(houses.map((house) => ({ ...house, status: 'inactive' }))));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.componentInstance.canChangeStatus()).toBe(true);
  });
});
