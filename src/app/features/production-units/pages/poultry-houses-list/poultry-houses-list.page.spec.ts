import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ProductionUnitsService } from '../../services/production-units.service';
import { PoultryHousesListPage } from './poultry-houses-list.page';

describe('PoultryHousesListPage', () => {
  let fixture: ComponentFixture<PoultryHousesListPage>;
  let listAllPoultryHouses: ReturnType<typeof vi.fn>;
  let listAllFeedPlants: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listAllPoultryHouses = vi.fn();
    listAllFeedPlants = vi.fn();
    TestBed.configureTestingModule({
      imports: [PoultryHousesListPage],
      providers: [
        provideRouter([]),
        { provide: ProductionUnitsService, useValue: { listAllPoultryHouses, listAllFeedPlants } },
      ],
    });
  });

  function render(): void {
    fixture = TestBed.createComponent(PoultryHousesListPage);
    fixture.detectChanges();
  }

  it('separates operational, maintenance and out-of-service houses from inactive houses', () => {
    const productionUnit = {
      id: 7,
      name: 'Granja Norte',
      locality: { name: 'Pando', department: { name: 'Canelones' } },
    };
    listAllPoultryHouses.mockReturnValue(of([
      { id: 1, name: 'Galpón Operativo', type: 'poultry', status: 'operational', bird_capacity: 1000, productionUnit },
      { id: 2, name: 'Galpón Mantenimiento', type: 'poultry', status: 'maintenance', bird_capacity: 900, productionUnit },
      { id: 3, name: 'Galpón Fuera de servicio', type: 'poultry', status: 'out_of_service', bird_capacity: 800, productionUnit },
      { id: 4, name: 'Galpón Inactivo', type: 'poultry', status: 'inactive', bird_capacity: 700, productionUnit },
    ]));

    render();

    const activeGroup = fixture.nativeElement.querySelector('[aria-labelledby="active-houses-title"]');
    const inactiveGroup = fixture.nativeElement.querySelector('[aria-labelledby="inactive-houses-title"]');
    expect(activeGroup.querySelectorAll('a.house-link')).toHaveLength(3);
    expect(activeGroup.textContent).toContain('Galpón Operativo');
    expect(activeGroup.textContent).toContain('Mantenimiento');
    expect(activeGroup.textContent).toContain('Fuera de servicio');
    expect(activeGroup.querySelector('.context-label')?.textContent).toContain('Granja Norte');
    expect(activeGroup.querySelector('.location')?.textContent).toContain('Pando, Canelones');
    expect(inactiveGroup.querySelectorAll('a.house-link')).toHaveLength(1);
    expect(inactiveGroup.textContent).toContain('Galpón Inactivo');
    expect(inactiveGroup.querySelector('.house-status[data-status="inactive"]')?.textContent).toBe('Inactivo');
  });

  it('shows bird capacity and links each card to that house detail route', () => {
    listAllPoultryHouses.mockReturnValue(of([{
      id: 22,
      name: 'Galpón Lotes Cuarentena Demo',
      type: 'poultry',
      status: 'operational',
      bird_capacity: 6000,
      productionUnit: {
        id: 12,
        name: 'Granja Sur',
        locality: { name: 'Libertad', department: { name: 'San José' } },
      },
    }]));

    render();

    const activeLink = fixture.nativeElement.querySelector('a.house-link');
    const inactiveGroup = fixture.nativeElement.querySelector('[aria-labelledby="inactive-houses-title"]');
    expect(activeLink.getAttribute('href')).toBe('/administracion/ubicaciones/unidades-productivas/12/galpon/22');
    expect(activeLink.getAttribute('aria-label'))
      .toBe('Abrir el detalle del galpón Galpón Lotes Cuarentena Demo');
    expect(activeLink.textContent).toContain('Capacidad: 6.000 aves');
    expect((activeLink.querySelector('.house-icon ion-icon') as HTMLElement & { name: string }).name)
      .toBe('egg-outline');
    expect(activeLink.querySelector('.occupancy-bar')).toBeNull();
    expect(inactiveGroup.textContent).toContain('No hay galpones inactivos.');
  });

  it('shows a proportional bar only when the API provides a numeric occupancy', () => {
    listAllPoultryHouses.mockReturnValue(of([{
      id: 24,
      name: 'Galpón con ocupación disponible',
      type: 'poultry',
      status: 'operational',
      bird_capacity: 6000,
      current_occupancy: 1500,
      productionUnit: {
        id: 12,
        name: 'Granja Sur',
        locality: { name: 'Libertad', department: { name: 'San José' } },
      },
    }]));

    render();

    const card = fixture.nativeElement.querySelector('a.house-link');
    const occupancyBar = card.querySelector('.occupancy-bar');
    expect(card.textContent).toContain('1.500 aves de 6.000 plazas');
    expect(occupancyBar.getAttribute('aria-label')).toBe('Ocupación: 1.500 aves de 6.000 plazas');
    expect(Number(occupancyBar.getAttribute('aria-valuenow'))).toBe(25);
  });

  it('shows an honest fallback when the contracted bird capacity is null', () => {
    listAllPoultryHouses.mockReturnValue(of([{
      id: 23,
      name: 'Galpón sin capacidad',
      type: 'poultry',
      status: 'operational',
      bird_capacity: null,
      productionUnit: {
        id: 12,
        name: 'Granja Sur',
        locality: { name: 'Libertad', department: { name: 'San José' } },
      },
    }]));

    render();

    const card = fixture.nativeElement.querySelector('a.house-link');
    expect(card.querySelector('.capacity')?.textContent).toContain('Capacidad no disponible');
    expect(card.querySelector('.occupancy-bar')).toBeNull();
  });

  it('shows an empty state when no poultry houses exist', () => {
    listAllPoultryHouses.mockReturnValue(of([]));

    render();

    expect(fixture.nativeElement.textContent).toContain('No hay galpones avícolas');
  });

  it('reuses the list for feed plants with a leaf icon and no capacity', () => {
    TestBed.inject(ActivatedRoute).snapshot.data['houseType'] = 'feed';
    listAllFeedPlants.mockReturnValue(of([{
      id: 30,
      name: 'Planta Norte',
      type: 'feed',
      status: 'operational',
      bird_capacity: null,
      productionUnit: {
        id: 7,
        name: 'Granja Norte',
        locality: { name: 'Pando', department: { name: 'Canelones' } },
      },
    }]));

    render();

    const link = fixture.nativeElement.querySelector('a.house-link');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Plantas de ración');
    expect(listAllFeedPlants).toHaveBeenCalledOnce();
    expect(listAllPoultryHouses).not.toHaveBeenCalled();
    expect(link.getAttribute('href')).toBe('/administracion/ubicaciones/unidades-productivas/7/galpon/30');
    expect(link.getAttribute('aria-label')).toBe('Abrir el detalle de la planta de ración Planta Norte');
    expect((link.querySelector('.house-icon ion-icon') as HTMLElement & { name: string }).name)
      .toBe('leaf-outline');
    expect(link.querySelector('.capacity')).toBeNull();
    expect(link.querySelector('.occupancy-bar')).toBeNull();
    expect(link.textContent).toContain('Granja Norte');
    expect(link.textContent).toContain('Pando, Canelones');
  });

  it('shows an error and retries the request when requested', () => {
    listAllPoultryHouses.mockReturnValueOnce(throwError(() => new Error('failed')))
      .mockReturnValueOnce(of([]));

    render();
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar el listado');

    fixture.nativeElement.querySelector('.state-panel ion-button').click();
    fixture.detectChanges();

    expect(listAllPoultryHouses).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('No hay galpones avícolas');
  });
});
