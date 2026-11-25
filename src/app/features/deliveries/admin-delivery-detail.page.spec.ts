import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { MAPBOX_ACCESS_TOKEN } from '../../core/config/mapbox.config';
import { AuthStore } from '../../core/auth/auth.store';
import { stubNativeDialog } from '../../shared/testing/native-dialog-test';
import { Delivery, DeliveryStop } from './delivery.models';
import { DeliveriesApi } from './deliveries.api';
import { AdminDeliveryDetailPage } from './admin-delivery-detail.page';

const mapState = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
  markerCoordinates: [] as Array<[number, number]>,
  mapRemoved: vi.fn(),
  markerRemoved: vi.fn(),
  resize: vi.fn(),
  fitBounds: vi.fn(),
  easeTo: vi.fn(),
  setData: vi.fn(),
}));

vi.mock('mapbox-gl/esm', () => {
  class MockMap {
    readonly host: HTMLElement;
    constructor(options: { container: HTMLElement }) { this.host = options.container; }
    on(event: string, listener: () => void): void { mapState.listeners.set(event, listener); }
    off(event: string): void { mapState.listeners.delete(event); }
    addControl(): void {}
    resize(): void { mapState.resize(); }
    addSource(): void {}
    addLayer(): void {}
    getSource() { return { setData: mapState.setData }; }
    setPaintProperty(): void {}
    fitBounds(bounds: unknown, options: unknown): void { mapState.fitBounds(bounds, options); }
    easeTo(options: unknown): void { mapState.easeTo(options); }
    remove(): void { mapState.mapRemoved(); }
  }
  class MockMarker {
    constructor(private readonly options: { element: HTMLElement }) {}
    getElement(): HTMLElement { return this.options.element; }
    setLngLat(coordinates: [number, number]): this { mapState.markerCoordinates.push(coordinates); return this; }
    setPopup(): this { return this; }
    addTo(map: MockMap): this { map.host.append(this.getElement()); return this; }
    remove(): void { this.getElement().remove(); mapState.markerRemoved(); }
  }
  class MockPopup { setDOMContent(): this { return this; } }
  class MockBounds {
    coordinates: Array<[number, number]> = [];
    extend(coordinates: [number, number]): void { this.coordinates.push(coordinates); }
  }
  class MockNavigationControl {}
  return { default: { Map: MockMap, Marker: MockMarker, Popup: MockPopup, LngLatBounds: MockBounds, NavigationControl: MockNavigationControl, accessToken: '' } };
});

describe('AdminDeliveryDetailPage', () => {
  let fixture: ComponentFixture<AdminDeliveryDetailPage>;
  let detail: ReturnType<typeof vi.fn>;

  const firstStop: DeliveryStop = {
    id: 5, version: 1, client_reference: 'client-1', client_name: 'Almacén Sur', address: 'Ruta 5', latitude: '-34.8', longitude: '-56.1',
    sequence: 1, status: 'delivered', delivered_quantity: 20, visit_reason: null, notes: null, visited_at: '2026-09-01T10:10:00Z',
  };
  const farStop: DeliveryStop = {
    ...firstStop, id: 6, client_reference: 'client-2', client_name: 'Almacén Lejano', latitude: '-33', longitude: '-54',
    sequence: 2, status: 'not_delivered', delivered_quantity: 0, visited_at: '2026-09-01T10:20:00Z',
  };
  const delivery: Delivery = {
    id: 'delivery-1', status: 'active', driver: { id: 1, name: 'Ana' },
    production_unit: { id: 7, name: 'Granja Norte', latitude: -34.9, longitude: -56.2 },
    vehicle_reference: null, loaded_quantity: 100, delivered_quantity: 20, returned_quantity: 0,
    remaining_quantity: 80, stops_summary: { total: 3, pending: 1, delivered: 1, not_delivered: 1 },
    started_at: '2026-09-01T10:00:00Z', closed_at: null,
    stops: [farStop, { ...farStop, id: 7, sequence: 3, status: 'pending', latitude: '-32', visited_at: null }, firstStop],
    latest_location: { id: 91, latitude: '-34.7', longitude: '-56.0', accuracy: 10, speed: null,
      captured_at: '2026-09-01T10:12:00Z', received_at: '2026-09-01T10:12:01Z' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mapState.listeners.clear();
    mapState.markerCoordinates = [];
    detail = vi.fn().mockReturnValue(of({ data: delivery }));
    TestBed.configureTestingModule({
      imports: [AdminDeliveryDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: delivery.id })) } },
        { provide: AuthStore, useValue: { isAdmin: () => true, status: () => 'personal_authenticated', user: () => null } },
        { provide: DeliveriesApi, useValue: { detail } },
        { provide: MAPBOX_ACCESS_TOKEN, useValue: 'configured-for-unit-test' },
      ],
    });
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(AdminDeliveryDetailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    mapState.listeners.get('load')?.();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws only completed visits in order, fits the distant stop, and retains other recorded markers', async () => {
    const host = await render();
    expect(detail).toHaveBeenCalledWith(delivery.id);
    expect(mapState.markerCoordinates).toEqual([[-56.2, -34.9], [-56.1, -34.8], [-56, -34.7], [-54, -33]]);
    expect(mapState.setData).toHaveBeenLastCalledWith({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-56.1, -34.8], [-54, -33]] } }],
    });
    expect(mapState.fitBounds).toHaveBeenCalledTimes(1);
    Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Ver recorrido completo'))?.click();
    expect(mapState.fitBounds).toHaveBeenLastCalledWith(expect.objectContaining({ coordinates: [[-56.1, -34.8], [-54, -33]] }), expect.anything());

    host.querySelectorAll<HTMLButtonElement>('.delivery-map-marker.visit')[1].click();
    fixture.detectChanges();
    expect(host.querySelector('tr.selected')?.textContent).toContain(farStop.client_name);
    expect(host.querySelector('a.customer-link')?.getAttribute('href')).toBe('/administracion/clientes/clientes/client-1?seccion=account');
    expect(host.querySelector('button.edit')).toBeNull();

    fixture.destroy();
    expect(mapState.mapRemoved).toHaveBeenCalledTimes(1);
    expect(mapState.markerRemoved).toHaveBeenCalledTimes(4);
    expect(mapState.listeners.has('load')).toBe(false);
    expect(mapState.listeners.has('error')).toBe(false);
  });

  it('opens the existing correction form only for an eligible delivery and hides the action after regularization', async () => {
    detail.mockReturnValueOnce(of({ data: { ...delivery, remaining_quantity: -10 } }));
    const host = await render();
    const buttons = host.querySelectorAll<HTMLButtonElement>('button.edit');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Rectificar entrega de Almacén Sur');
    buttons[0].click();
    fixture.detectChanges();
    expect(host.querySelector('form[aria-label="Rectificar entrega"]')?.textContent).toContain('Almacén Sur');
    fixture.componentInstance.refreshCorrection(delivery.id, 'Entrega rectificada.');
    fixture.detectChanges();
    expect(host.textContent).toContain('Entrega rectificada.');
    expect(host.querySelector('button.edit')).toBeNull();
  });

  it('opens the same map in a dialog and restores it to the detail with focus on the opener', async () => {
    const restoreNativeDialog = stubNativeDialog();
    try {
      const host = await render();
      const map = host.querySelector('.admin-map');
      const trigger = host.querySelector<HTMLButtonElement>('.map-open')!;
      const dialog = host.querySelector<HTMLDialogElement>('.map-dialog')!;
      const inline = host.querySelector('.map-shell');
      const resizeCount = mapState.resize.mock.calls.length;

      trigger.click();
      expect(dialog.open).toBe(true);
      expect(dialog.querySelector('.admin-map')).toBe(map);
      expect(dialog.querySelectorAll('.delivery-map-marker.visit')).toHaveLength(2);

      dialog.querySelector<HTMLButtonElement>('header button')!.click();
      dialog.dispatchEvent(new Event('close'));
      expect(dialog.open).toBe(false);
      expect(inline?.querySelector('.admin-map')).toBe(map);
      expect(document.activeElement).toBe(trigger);
      expect(mapState.resize).toHaveBeenCalledTimes(resizeCount + 2);
      expect(mapState.fitBounds).toHaveBeenCalledTimes(1);
      expect(mapState.mapRemoved).not.toHaveBeenCalled();
    } finally {
      restoreNativeDialog();
    }
  });

  it('shows the missing-location state without plotting invalid coordinates', async () => {
    detail.mockReturnValue(of({ data: {
      ...delivery, production_unit: { id: 7, name: 'Granja Norte', latitude: 'Infinity', longitude: -56.2 },
      latest_location: null, stops: [{ ...firstStop, latitude: '', longitude: '' }],
    } }));
    const host = await render();
    expect(host.textContent).toContain('Ubicación no disponible');
    expect(mapState.markerCoordinates).toEqual([]);
    expect(mapState.setData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] });
  });
});
