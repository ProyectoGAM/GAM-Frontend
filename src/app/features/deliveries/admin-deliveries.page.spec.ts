import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';

import { MAPBOX_ACCESS_TOKEN } from '../../core/config/mapbox.config';
import { AdminUnitContextService } from '../admin/services/admin-unit-context.service';
import { Delivery } from './delivery.models';
import { DeliveriesApi } from './deliveries.api';
import { AdminDeliveriesPage } from './admin-deliveries.page';

const mapState = vi.hoisted(() => ({
  listeners: new Map<string, (event?: unknown) => void>(),
  mapOptions: null as unknown,
  markerCoordinates: [] as Array<[number, number]>,
  mapRemoved: vi.fn(),
  markerRemoved: vi.fn(),
  fitBounds: vi.fn(),
  easeTo: vi.fn(),
}));

vi.mock('mapbox-gl', () => {
  class MockMap {
    constructor(options: unknown) { mapState.mapOptions = options; }
    on(event: string, listener: (event?: unknown) => void): this { mapState.listeners.set(event, listener); return this; }
    off(event: string): this { mapState.listeners.delete(event); return this; }
    addControl(): this { return this; }
    resize(): this { return this; }
    fitBounds(bounds: unknown, options: unknown): this { mapState.fitBounds(bounds, options); return this; }
    easeTo(options: unknown): this { mapState.easeTo(options); return this; }
    remove(): void { mapState.mapRemoved(); }
  }
  class MockMarker {
    constructor(_options: unknown) {}
    setLngLat(coordinates: [number, number]): this { mapState.markerCoordinates.push(coordinates); return this; }
    addTo(): this { return this; }
    remove(): void { mapState.markerRemoved(); }
  }
  class MockBounds {
    coordinates: Array<[number, number]> = [];
    extend(coordinates: [number, number]): this { this.coordinates.push(coordinates); return this; }
  }
  class MockNavigationControl {}
  return { default: { Map: MockMap, Marker: MockMarker, LngLatBounds: MockBounds, NavigationControl: MockNavigationControl, accessToken: '' } };
});

describe('AdminDeliveriesPage', () => {
  let fixture: ComponentFixture<AdminDeliveriesPage>;
  let current: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;
  let detail: ReturnType<typeof vi.fn>;
  let selectedId: ReturnType<typeof signal<number | null>>;

  const activeDelivery: Delivery = {
    id: 'delivery-1', status: 'active', driver: { id: 1, name: 'Ana' },
    production_unit: { id: 7, name: 'Granja Norte', latitude: -34.9, longitude: -56.2 },
    vehicle_reference: null, loaded_quantity: 100, delivered_quantity: 20, returned_quantity: 0,
    remaining_quantity: 80, stops_summary: { total: 1, pending: 0, delivered: 1, not_delivered: 0 },
    started_at: '2026-09-01T10:00:00Z', closed_at: null, latest_location: null,
  };
  const detailedDelivery: Delivery = {
    ...activeDelivery,
    stops: [{
      id: 5, client_reference: 'client-1', client_name: 'Almacén Sur', address: 'Ruta 5', latitude: '-34.8', longitude: '-56.1',
      sequence: 1, status: 'delivered', delivered_quantity: 20, visit_reason: null, notes: null, visited_at: '2026-09-01T10:10:00Z',
    }],
    latest_location: {
      id: 91, latitude: '-34.7', longitude: '-56.0', accuracy: 10, speed: null,
      captured_at: '2026-09-01T10:12:00Z', received_at: '2026-09-01T10:12:01Z',
    },
  };
  const completedDelivery: Delivery = { ...activeDelivery, id: 'delivery-history', status: 'completed', closed_at: '2026-09-01T11:00:00Z' };

  beforeEach(() => {
    mapState.listeners.clear();
    mapState.mapOptions = null;
    mapState.markerCoordinates = [];
    mapState.mapRemoved.mockClear();
    mapState.markerRemoved.mockClear();
    mapState.fitBounds.mockClear();
    mapState.easeTo.mockClear();
    selectedId = signal<number | null>(7);
    current = vi.fn().mockReturnValue(of({ data: [activeDelivery] }));
    list = vi.fn().mockReturnValue(of({ data: [activeDelivery, completedDelivery] }));
    detail = vi.fn().mockImplementation((id: string) => of({ data: { ...detailedDelivery, id, status: id === 'delivery-history' ? 'completed' : 'active' } }));
    TestBed.configureTestingModule({
      imports: [AdminDeliveriesPage],
      providers: [
        { provide: AdminUnitContextService, useValue: { selectedId, selectedUnit: () => ({ id: 7, name: 'Granja Norte' }) } },
        { provide: DeliveriesApi, useValue: { current, list, detail } },
        { provide: MAPBOX_ACCESS_TOKEN, useValue: 'configured-for-unit-test' },
      ],
    });
  });

  async function render(): Promise<AdminDeliveriesPage> {
    fixture = TestBed.createComponent(AdminDeliveriesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('filters both API loads, syncs persisted stops and latest location, and destroys Mapbox on navigation away', async () => {
    const page = await render();
    expect(current).toHaveBeenCalledWith({ production_unit_id: 7 });
    expect(list).toHaveBeenCalledWith({ per_page: 50, production_unit_id: 7 });
    expect(detail).toHaveBeenCalledWith('delivery-1');
    expect(page.selected()?.id).toBe('delivery-1');
    expect(mapState.mapOptions).toMatchObject({ center: [-56.1645, -34.9011], zoom: 5 });

    mapState.listeners.get('load')?.();
    fixture.detectChanges();
    expect(page.hasMapPoints()).toBe(true);
    expect(mapState.markerCoordinates).toEqual([[-56.2, -34.9], [-56.1, -34.8], [-56, -34.7]]);
    expect(mapState.fitBounds).toHaveBeenCalledTimes(1);

    const historyRow = fixture.nativeElement.querySelectorAll('.delivery-row')[1] as HTMLButtonElement;
    historyRow.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(detail).toHaveBeenLastCalledWith('delivery-history');
    expect(page.selected()?.id).toBe('delivery-history');

    page.load();
    await fixture.whenStable();
    expect(current).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(2);

    mapState.markerRemoved.mockClear();
    fixture.destroy();
    expect(mapState.mapRemoved).toHaveBeenCalledTimes(1);
    expect(mapState.markerRemoved).toHaveBeenCalledTimes(3);
    expect(mapState.listeners.has('load')).toBe(false);
    expect(mapState.listeners.has('error')).toBe(false);
  });

  it('cancels stale unit-filter requests when the selected unit changes', async () => {
    const pendingCurrent = new Map<number, Subject<{ data: Delivery[] }>>();
    const pendingList = new Map<number, Subject<{ data: Delivery[] }>>();
    current.mockImplementation((filters: { production_unit_id?: number }) => {
      const subject = new Subject<{ data: Delivery[] }>();
      pendingCurrent.set(filters.production_unit_id ?? 0, subject);
      return subject;
    });
    list.mockImplementation((filters: { production_unit_id?: number }) => {
      const subject = new Subject<{ data: Delivery[] }>();
      pendingList.set(filters.production_unit_id ?? 0, subject);
      return subject;
    });

    const page = await render();
    selectedId.set(12);
    fixture.detectChanges();
    await fixture.whenStable();

    const unit12 = { ...activeDelivery, id: 'delivery-12', production_unit: { id: 12, name: 'Granja Sur' } };
    pendingCurrent.get(7)?.next({ data: [activeDelivery] });
    pendingCurrent.get(7)?.complete();
    pendingList.get(7)?.next({ data: [activeDelivery] });
    pendingList.get(7)?.complete();
    pendingCurrent.get(12)?.next({ data: [unit12] });
    pendingCurrent.get(12)?.complete();
    pendingList.get(12)?.next({ data: [unit12] });
    pendingList.get(12)?.complete();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(current).toHaveBeenCalledWith({ production_unit_id: 12 });
    expect(list).toHaveBeenCalledWith({ per_page: 50, production_unit_id: 12 });
    expect(page.active().map((delivery) => delivery.id)).toEqual(['delivery-12']);
    fixture.destroy();
  });

  it('shows the missing-location state and clears markers when saved coordinates are invalid', async () => {
    const invalid = {
      ...detailedDelivery,
      production_unit: { id: 7, name: 'Granja Norte', latitude: 'Infinity', longitude: -56.2 },
      latest_location: null,
      stops: [],
    };
    detail.mockReturnValue(of({ data: invalid }));
    const page = await render();
    mapState.listeners.get('load')?.();
    fixture.detectChanges();

    expect(page.hasMapPoints()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Ubicación no disponible');
    expect(mapState.markerCoordinates).toEqual([]);
    fixture.destroy();
  });
});
