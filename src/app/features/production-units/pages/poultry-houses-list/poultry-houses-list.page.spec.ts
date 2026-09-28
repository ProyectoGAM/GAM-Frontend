import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ProductionUnitsService } from '../../services/production-units.service';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
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

  it('shows only installations belonging to the selected UP', () => {
    const selectedId = signal<number | null>(7);
    TestBed.overrideProvider(AdminUnitContextService, { useValue: { selectedId } });
    listAllPoultryHouses.mockReturnValue(of([
      { id: 1, name: 'Galpón Norte', type: 'poultry', status: 'operational', bird_capacity: 1000,
        productionUnit: { id: 7, name: 'Norte', locality: { name: 'Pando', department: { name: 'Canelones' } } } },
      { id: 2, name: 'Galpón Sur', type: 'poultry', status: 'operational', bird_capacity: 1000,
        productionUnit: { id: 8, name: 'Sur', locality: { name: 'Pando', department: { name: 'Canelones' } } } },
    ]));

    render();
    expect(fixture.nativeElement.textContent).toContain('Galpón Norte');
    expect(fixture.nativeElement.textContent).not.toContain('Galpón Sur');
    selectedId.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Galpón Sur');
  });

  it('uses the global UP without asking for it again, then allows a local UP when the global scope is all', () => {
    const selectedId = signal<number | null>(7);
    TestBed.overrideProvider(AdminUnitContextService, { useValue: { selectedId } });
    const north = { id: 7, name: 'Granja Norte', locality: { name: 'Pando', department: { name: 'Canelones' } } };
    const south = { id: 8, name: 'Granja Sur', locality: { name: 'Libertad', department: { name: 'San José' } } };
    listAllPoultryHouses.mockReturnValue(of([
      { id: 1, name: 'Galpón Norte', type: 'poultry', status: 'operational', bird_capacity: 1000, productionUnit: north },
      { id: 2, name: 'Galpón Sur', type: 'poultry', status: 'operational', bird_capacity: 1000, productionUnit: south },
    ]));

    render();
    expect(fixture.nativeElement.querySelector('.global-chip')?.textContent).toContain('Granja Norte');
    expect(fixture.nativeElement.querySelector('#house-unit-filter')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('a.house-link')).toHaveLength(1);

    selectedId.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#house-unit-filter')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('a.house-link')).toHaveLength(2);

    fixture.componentInstance.draftUnitId.set(8);
    fixture.componentInstance.applyFilters();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a.house-link')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Galpón Sur');

    selectedId.set(7);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Galpón Norte');
    expect(fixture.nativeElement.textContent).not.toContain('Galpón Sur');
    expect(fixture.componentInstance.selectedUnitId()).toBeNull();
  });

  it('names a globally selected UP even when it has no installations', () => {
    const emptyUnit = { id: 9, name: 'Granja Vacía', locality: { name: 'Pando', department: { name: 'Canelones' } } };
    const selectedId = signal<number | null>(9);
    TestBed.overrideProvider(AdminUnitContextService, {
      useValue: { selectedId, selectedUnit: signal(emptyUnit), units: signal([emptyUnit]) },
    });
    listAllPoultryHouses.mockReturnValue(of([{
      id: 1, name: 'Galpón Norte', type: 'poultry', status: 'operational', bird_capacity: 1000,
      productionUnit: { id: 7, name: 'Granja Norte', locality: { name: 'Pando', department: { name: 'Canelones' } } },
    }]));

    render();
    expect(fixture.nativeElement.querySelector('.global-chip')?.textContent).toContain('Granja Vacía');
    expect(fixture.nativeElement.querySelector('.no-results h2')?.textContent).toBe('Sin resultados');
  });

  it('searches names and locations without accents and shows a distinct no-results state', () => {
    const unit = { id: 7, name: 'Granja El Ombú', locality: { name: 'Las Piedras', department: { name: 'Canelones' } } };
    listAllPoultryHouses.mockReturnValue(of([
      { id: 1, name: 'Galpón Norte', type: 'poultry', status: 'operational', bird_capacity: 1000, productionUnit: unit },
      { id: 2, name: 'Galpón Sur', type: 'poultry', status: 'inactive', bird_capacity: 1000, productionUnit: unit },
    ]));
    render();

    const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'ombu';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a.house-link')).toHaveLength(2);

    search.value = 'norte';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a.house-link')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).not.toContain('Galpón Sur');

    search.value = 'sin coincidencia';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.no-results h2')?.textContent).toBe('Sin resultados');
    expect(fixture.nativeElement.querySelectorAll('a.house-link')).toHaveLength(0);
  });

  it('combines status and occupancy, excluding unknown occupancy from Con aves and Sin aves', () => {
    const unit = { id: 7, name: 'Granja Norte', locality: { name: 'Pando', department: { name: 'Canelones' } } };
    listAllPoultryHouses.mockReturnValue(of([
      { id: 1, name: 'Con aves', type: 'poultry', status: 'operational', bird_capacity: 100, current_occupancy: 20, productionUnit: unit },
      { id: 2, name: 'Sin aves', type: 'poultry', status: 'operational', bird_capacity: 100, current_occupancy: 0, productionUnit: unit },
      { id: 3, name: 'Ocupación desconocida', type: 'poultry', status: 'operational', bird_capacity: 100, productionUnit: unit },
      { id: 4, name: 'En mantenimiento', type: 'poultry', status: 'maintenance', bird_capacity: 100, current_occupancy: 0, productionUnit: unit },
    ]));
    render();

    fixture.componentInstance.draftStatus.set('operational');
    fixture.componentInstance.draftOccupancy.set('empty');
    fixture.componentInstance.applyFilters();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a.house-link')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('a.house-link')?.textContent).toContain('Sin aves');
    expect(fixture.nativeElement.querySelector('.filter-badge')?.textContent).toBe('2');

    fixture.componentInstance.draftOccupancy.set('occupied');
    fixture.componentInstance.applyFilters();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a.house-link')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('a.house-link')?.textContent).toContain('Con aves');
  });

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
    expect(activeLink.getAttribute('href')).toBe('/administracion/unidades-productivas/12/galpon/22');
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
    expect(link.getAttribute('href')).toBe('/administracion/unidades-productivas/7/galpon/30');
    expect(link.getAttribute('aria-label')).toBe('Abrir el detalle de la planta de ración Planta Norte');
    expect((link.querySelector('.house-icon ion-icon') as HTMLElement & { name: string }).name)
      .toBe('leaf-outline');
    expect(link.querySelector('.capacity')).toBeNull();
    expect(link.querySelector('.occupancy-bar')).toBeNull();
    expect(link.textContent).toContain('Granja Norte');
    expect(link.textContent).toContain('Pando, Canelones');
    expect(fixture.nativeElement.querySelectorAll('.filter-section')).toHaveLength(2);
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
