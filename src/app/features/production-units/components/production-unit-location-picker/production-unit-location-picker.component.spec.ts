import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { MAPBOX_ACCESS_TOKEN } from '../../../../core/config/mapbox.config';
import { ProductionUnitLocationValue } from '../../interfaces/production-unit.interface';
import { MapboxPlace, ProductionUnitGeocodingService } from '../../services/production-unit-geocoding.service';
import { ProductionUnitLocationPickerComponent } from './production-unit-location-picker.component';
import { ProductionUnitsService } from '../../services/production-units.service';

const mapboxState = vi.hoisted(() => ({
  mapListeners: new Map<string, (event?: unknown) => void>(),
  markerListeners: new Map<string, () => void>(),
  mapOptions: null as unknown,
  markerOptions: null as unknown,
  markerCoordinates: [0, 0] as [number, number],
  mapRemoved: vi.fn(),
  markerRemoved: vi.fn(),
  markerSetLngLat: vi.fn(),
  mapResize: vi.fn(),
  mapFlyTo: vi.fn(),
}));

vi.mock('mapbox-gl', () => {
  class MockMap {
    constructor(options: unknown) { mapboxState.mapOptions = options; }
    on(event: string, listener: (event?: unknown) => void): this { mapboxState.mapListeners.set(event, listener); return this; }
    off(event: string): this { mapboxState.mapListeners.delete(event); return this; }
    addControl(): this { return this; }
    resize(): this { mapboxState.mapResize(); return this; }
    flyTo(options: unknown): this { mapboxState.mapFlyTo(options); return this; }
    remove(): void { mapboxState.mapRemoved(); }
  }
  class MockMarker {
    constructor(options: unknown) { mapboxState.markerOptions = options; }
    setLngLat(coordinates: [number, number]): this {
      mapboxState.markerCoordinates = coordinates;
      mapboxState.markerSetLngLat(coordinates);
      return this;
    }
    addTo(): this { return this; }
    on(event: string, listener: () => void): this { mapboxState.markerListeners.set(event, listener); return this; }
    off(event: string): this { mapboxState.markerListeners.delete(event); return this; }
    getLngLat(): { lng: number; lat: number } {
      return { lng: mapboxState.markerCoordinates[0], lat: mapboxState.markerCoordinates[1] };
    }
    remove(): void { mapboxState.markerRemoved(); }
  }
  class MockNavigationControl {}
  return { default: { Map: MockMap, Marker: MockMarker, NavigationControl: MockNavigationControl, accessToken: '' } };
});

describe('ProductionUnitLocationPickerComponent', () => {
  let fixture: ComponentFixture<ProductionUnitLocationPickerComponent>;
  let search: ReturnType<typeof vi.fn>;
  let reverse: ReturnType<typeof vi.fn>;
  let validateLocation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mapboxState.mapListeners.clear();
    mapboxState.markerListeners.clear();
    mapboxState.mapOptions = null;
    mapboxState.markerOptions = null;
    mapboxState.markerCoordinates = [0, 0];
    mapboxState.mapRemoved.mockClear();
    mapboxState.markerRemoved.mockClear();
    mapboxState.markerSetLngLat.mockClear();
    mapboxState.mapResize.mockClear();
    mapboxState.mapFlyTo.mockClear();
    search = vi.fn().mockReturnValue(of([]));
    reverse = vi.fn().mockReturnValue(of([]));
    validateLocation = vi.fn().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      imports: [ProductionUnitLocationPickerComponent],
      providers: [
        { provide: ProductionUnitGeocodingService, useValue: { search, reverse } },
        { provide: ProductionUnitsService, useValue: { validateLocation } },
        { provide: MAPBOX_ACCESS_TOKEN, useValue: 'configured-for-unit-test' },
      ],
    });
  });

  async function render(initialLocation: { address?: string | null; latitude: number | string | null; longitude: number | string | null } | null = null, readOnly = false) {
    fixture = TestBed.createComponent(ProductionUnitLocationPickerComponent);
    fixture.componentRef.setInput('initialLocation', initialLocation);
    fixture.componentRef.setInput('readOnly', readOnly);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  function loadMap(): void {
    mapboxState.mapListeners.get('load')?.();
  }

  const place = (id: string, address: string, longitude: number, latitude: number): MapboxPlace => ({
    id,
    place_name: address,
    center: [longitude, latitude],
  });

  it('starts centered on Uruguay without selecting it and accepts the first map click after load', async () => {
    const component = await render();
    const changes: Array<ProductionUnitLocationValue | null> = [];
    component.locationChange.subscribe((value) => changes.push(value));

    expect(mapboxState.mapOptions).toMatchObject({ center: [-56.1645, -34.9011], zoom: 6, maxBounds: [[-58.6, -35.2], [-53, -30]] });
    expect(component.location()).toBeNull();
    loadMap();
    const click = mapboxState.mapListeners.get('click');
    expect(click).toBeDefined();
    click?.({ lngLat: { lat: -34.8, lng: -56.1 } });

    expect(component.location()).toMatchObject({ latitude: -34.8, longitude: -56.1, isConfirmed: false });
    expect(changes[0]).toMatchObject({ latitude: -34.8, longitude: -56.1, address: null });
    expect(validateLocation).toHaveBeenCalledWith(-34.8, -56.1);
    expect(reverse).toHaveBeenCalledWith(-34.8, -56.1);
    expect(component.addressText()).toContain('Punto seleccionado');
  });

  it('selects a suggestion, updates the pin/camera and emits GAM latitude/longitude order', async () => {
    const component = await render();
    loadMap();
    const suggestions = new Subject<MapboxPlace[]>();
    search.mockReturnValueOnce(suggestions);
    vi.useFakeTimers();
    component.onAddressInput('Ruta 8, Las Piedras');
    await vi.advanceTimersByTimeAsync(350);
    suggestions.next([place('address.1', 'Ruta 8, Las Piedras, Uruguay', -56.2, -34.9)]);
    fixture.detectChanges();

    expect(component.suggestions().length).toBe(1);
    component.chooseSuggestion(component.suggestions()[0]);

    expect(component.location()).toMatchObject({
      address: 'Ruta 8, Las Piedras, Uruguay',
      latitude: -34.9,
      longitude: -56.2,
      isConfirmed: true,
    });
    expect(mapboxState.markerCoordinates).toEqual([-56.2, -34.9]);
    expect(mapboxState.mapFlyTo).toHaveBeenCalledWith({ center: [-56.2, -34.9], zoom: 15, essential: true });
    vi.useRealTimers();
  });

  it('keeps the newest query when a previous geocoding response arrives late', async () => {
    const component = await render();
    const oldResults = new Subject<MapboxPlace[]>();
    const newResults = new Subject<MapboxPlace[]>();
    search.mockImplementation((query: string) => query === 'ruta anterior' ? oldResults : newResults);
    vi.useFakeTimers();
    component.onAddressInput('ruta anterior');
    await vi.advanceTimersByTimeAsync(350);
    component.onAddressInput('ruta actual');
    oldResults.next([place('old', 'Dirección anterior', -56.1, -34.8)]);
    fixture.detectChanges();
    expect(component.suggestions()).toEqual([]);

    await vi.advanceTimersByTimeAsync(350);
    newResults.next([place('new', 'Dirección actual', -56.2, -34.9)]);
    fixture.detectChanges();

    expect(component.suggestions()).toEqual([place('new', 'Dirección actual', -56.2, -34.9)]);
    vi.useRealTimers();
  });

  it('ignores a late reverse result after selecting a newer map point', async () => {
    const component = await render();
    const previous = new Subject<MapboxPlace[]>();
    const current = new Subject<MapboxPlace[]>();
    reverse.mockImplementation((latitude: number) => latitude === -34.8 ? previous : current);
    loadMap();
    mapboxState.mapListeners.get('click')?.({ lngLat: { lat: -34.8, lng: -56.1 } });
    mapboxState.mapListeners.get('click')?.({ lngLat: { lat: -34.9, lng: -56.2 } });
    previous.next([place('old', 'Dirección anterior', -56.1, -34.8)]);
    expect(component.addressText()).toContain('Punto seleccionado');
    current.next([place('new', 'Dirección actual', -56.2, -34.9)]);

    expect(component.location()).toMatchObject({ address: 'Dirección actual', latitude: -34.9, longitude: -56.2, isConfirmed: true });
  });

  it('does not let a late reverse result replace a selected search result', async () => {
    const component = await render();
    const previous = new Subject<MapboxPlace[]>();
    reverse.mockReturnValue(previous);
    loadMap();
    mapboxState.mapListeners.get('click')?.({ lngLat: { lat: -34.8, lng: -56.1 } });
    component.chooseSuggestion(place('address.2', 'Ruta 5, Canelones', -56.3, -34.7));
    previous.next([place('old', 'Dirección anterior', -56.1, -34.8)]);

    expect(component.location()).toMatchObject({
      address: 'Ruta 5, Canelones',
      latitude: -34.7,
      longitude: -56.3,
      isConfirmed: true,
    });
  });

  it('updates a dragged marker and retains its point when reverse geocoding finds no address', async () => {
    const component = await render();
    const noAddress = new Subject<MapboxPlace[]>();
    reverse.mockReturnValue(noAddress);
    loadMap();
    mapboxState.mapListeners.get('click')?.({ lngLat: { lat: -34.8, lng: -56.1 } });
    mapboxState.markerCoordinates = [-55.8, -33.7];
    mapboxState.markerListeners.get('dragend')?.();
    noAddress.next([]);
    fixture.detectChanges();

    expect(component.location()).toMatchObject({ latitude: -33.7, longitude: -55.8, address: null, isConfirmed: false });
    expect(fixture.nativeElement.textContent).toContain('No encontramos una dirección exacta');
  });

  it('rejects an outside drag and restores the last server-confirmed point', async () => {
    const component = await render();
    loadMap();
    mapboxState.mapListeners.get('click')?.({ lngLat: { lat: -34.8, lng: -56.1 } });
    const confirmed = component.location();
    mapboxState.markerCoordinates = [-56.5, -35.5];
    validateLocation.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422 })));
    mapboxState.markerListeners.get('dragend')?.();

    expect(validateLocation).toHaveBeenLastCalledWith(-35.5, -56.5);
    expect(component.location()).toEqual(confirmed);
    expect(mapboxState.markerCoordinates).toEqual([-56.1, -34.8]);
    expect(component.selectionError()).toContain('fuera del territorio');
  });

  it('keeps rural coordinates without an exact reverse result and requires a confirmed corrected label', async () => {
    const component = await render();
    loadMap();
    mapboxState.mapListeners.get('click')?.({ lngLat: { lat: -34.8, lng: -56.1 } });
    expect(component.location()).toMatchObject({ latitude: -34.8, longitude: -56.1, address: null, isConfirmed: false });
    expect(component.addressText()).toContain('Punto seleccionado');
    expect(component.canConfirmAddressForPoint()).toBe(false);

    component.onAddressInput('Camino vecinal, paraje rural');
    expect(component.location()).toMatchObject({ latitude: -34.8, longitude: -56.1, address: null, isConfirmed: false });
    component.confirmAddressForPoint();

    expect(component.location()).toMatchObject({
      latitude: -34.8, longitude: -56.1, address: 'Camino vecinal, paraje rural', isConfirmed: true,
    });
  });

  it('loads the existing point for reading without enabling map clicks or marker dragging', async () => {
    const component = await render({ address: 'Ruta 8, Pando', latitude: '-34.9', longitude: '-56.2' }, true);
    loadMap();

    expect(mapboxState.mapOptions).toMatchObject({ center: [-56.2, -34.9], zoom: 14 });
    expect(component.addressText()).toBe('Ruta 8, Pando');
    expect(mapboxState.mapListeners.has('click')).toBe(false);
    expect(mapboxState.markerOptions).toMatchObject({ draggable: false });
  });

  it('centers on a historic point outside Uruguay without inventing or clamping its coordinates', async () => {
    const component = await render({ latitude: '5', longitude: '10', address: null });

    expect(mapboxState.mapOptions).toMatchObject({ center: [10, 5], zoom: 14, maxBounds: undefined });
    expect(component.location()).toMatchObject({ latitude: 5, longitude: 10, isConfirmed: true });
  });

  it('removes map and marker listeners when the selector is destroyed', async () => {
    await render();
    loadMap();
    fixture.destroy();

    expect(mapboxState.mapRemoved).toHaveBeenCalledTimes(1);
    expect(mapboxState.mapListeners.size).toBe(0);
    expect(mapboxState.markerListeners.size).toBe(0);
  });
});
