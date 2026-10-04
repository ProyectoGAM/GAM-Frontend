import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { MAPBOX_ACCESS_TOKEN } from '../../../../core/config/mapbox.config';
import { PoultryHouse } from '../../interfaces/production-unit.interface';
import { ProductionUnitGeocodingService } from '../../services/production-unit-geocoding.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { ProductionUnitDetailPage } from './production-unit-detail.page';

describe('ProductionUnitDetailPage', () => {
  let fixture: ComponentFixture<ProductionUnitDetailPage>;
  let poultryHouses: ReturnType<typeof vi.fn>;
  let getById: ReturnType<typeof vi.fn>;

  const houses: PoultryHouse[] = [
    { id: 1, name: 'Galpón Este', type: 'poultry', status: 'operational', bird_capacity: 2000, current_occupancy: 10 },
    { id: 2, name: 'Planta Norte', type: 'feed', status: 'maintenance', bird_capacity: null, current_occupancy: null },
    { id: 3, name: 'Galpón Sur', type: 'poultry', status: 'inactive', bird_capacity: 1500, current_occupancy: 0 },
    { id: 4, name: 'Planta Sur', type: 'feed', status: 'inactive', bird_capacity: null, current_occupancy: null },
  ];

  beforeEach(() => {
    poultryHouses = vi.fn().mockReturnValue(of(houses));
    getById = vi.fn().mockReturnValue(of({ data: {
      id: 7,
      name: 'Granja Norte',
      status: 'active',
      locality: { name: 'Pando', department: { name: 'Canelones' } },
    } }));
    TestBed.configureTestingModule({
      imports: [ProductionUnitDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
        { provide: AlertController, useValue: {} },
        {
          provide: ProductionUnitsService,
          useValue: {
            getById,
            poultryHouses,
          },
        },
        { provide: ProductionUnitGeocodingService, useValue: { search: vi.fn().mockReturnValue(of([])), reverse: vi.fn().mockReturnValue(of([])) } },
        { provide: MAPBOX_ACCESS_TOKEN, useValue: '' },
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
    expect(poultryLink.textContent).toContain('10 aves de 2.000 plazas');
    expect((poultryLink.querySelector('.house-icon ion-icon') as HTMLElement & { name: string }).name)
      .toBe('egg-outline');
    expect(Number(poultryLink.querySelector('.occupancy-bar')?.getAttribute('aria-valuenow'))).toBe(0.5);

    const feedLink = active.querySelector('a[aria-label="Ver planta de ración Planta Norte"]');
    expect(feedLink.getAttribute('href')).toBe('/administracion/unidades-productivas/7/galpon/2');
    expect(feedLink.textContent).toContain('Planta de ración');
    expect(feedLink.textContent).toContain('Mantenimiento');
    expect((feedLink.querySelector('.house-icon ion-icon') as HTMLElement & { name: string }).name)
      .toBe('leaf-outline');
    expect(feedLink.querySelector('.capacity')).toBeNull();
    expect(feedLink.querySelector('.occupancy-bar')).toBeNull();
    expect(inactive.textContent).toContain('Galpón Sur');
    expect(inactive.textContent).toContain('Planta Sur');
  });

  it('shows capacity without occupancy or a bar when current occupancy is absent', () => {
    poultryHouses.mockReturnValue(of([{
      id: 5,
      name: 'Galpón sin ocupación informada',
      type: 'poultry',
      status: 'operational',
      bird_capacity: 900,
    }]));

    render();

    const houseLink = fixture.nativeElement.querySelector('a.house-link');
    expect(houseLink.querySelector('.capacity')?.textContent).toContain('Capacidad: 900 aves');
    expect(houseLink.querySelector('.occupancy-bar')).toBeNull();
  });

  it('shows a persisted address and map for a valid historic point without an address', () => {
    getById.mockReturnValue(of({ data: {
      id: 7,
      name: 'Granja Norte',
      status: 'active',
      address: null,
      latitude: '-34.9',
      longitude: '-56.2',
      locality: { name: 'Pando', department: { name: 'Canelones' } },
    } }));

    render();

    expect(fixture.nativeElement.querySelector('.map-canvas')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Punto seleccionado en el mapa');
    expect(fixture.nativeElement.textContent).not.toContain('Latitud');
    expect(fixture.nativeElement.textContent).not.toContain('Longitud');
  });

  it('does not draw a fallback point when historic coordinates are invalid', () => {
    getById.mockReturnValue(of({ data: {
      id: 7,
      name: 'Granja Norte',
      status: 'active',
      address: 'Ruta 8',
      latitude: 'Infinity',
      longitude: '-56.2',
      locality: { name: 'Pando', department: { name: 'Canelones' } },
    } }));

    render();

    expect(fixture.nativeElement.textContent).toContain('Ubicación no disponible');
    expect(fixture.nativeElement.querySelector('.map-canvas')).toBeNull();
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
