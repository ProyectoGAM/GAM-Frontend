import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, tap, throwError } from 'rxjs';

import { AuthStore } from '../../core/auth/auth.store';
import { ServerHealthService } from '../../core/api/server-health.service';
import { MAPBOX_ACCESS_TOKEN } from '../../core/config/mapbox.config';
import { LocationService } from '../../core/native/location.service';
import { NetworkService } from '../../core/native/network.service';
import { ThemeService } from '../../core/theme/theme.service';
import { DeliveryOutboxEntry, DeliveryOutboxService } from './delivery-outbox.service';
import { DeliveryPage } from './delivery.page';
import { DeliveriesApi } from './deliveries.api';
import { VehiclesApi } from '../vehicles/services/vehicles.api';
import type { CustomerMovement } from '../customers/interfaces/customer';
import { Delivery, DeliveryClient, DeliveryStop } from './delivery.models';

const mapCalls = vi.hoisted(() => ({
  create: vi.fn(),
  jumpTo: vi.fn(),
  resize: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('mapbox-gl/esm', () => {
  class MockMap {
    constructor(private readonly options: { container: HTMLElement }) {
      options.container.classList.add('mapboxgl-map');
      mapCalls.create(options);
    }
    addControl(): void {}
    on(): void {}
    resize(): void { mapCalls.resize(); }
    remove(): void { mapCalls.remove(); }
    fitBounds(): void {}
    jumpTo(options: unknown): void { mapCalls.jumpTo(options); }
    getContainer(): HTMLElement { return this.options.container; }
    getBounds() { return { getWest: () => -56.3, getEast: () => -56.1, getSouth: () => -34.9, getNorth: () => -34.7 }; }
  }
  class MockMarker {
    constructor(private readonly options: { element: HTMLElement }) {}
    getElement(): HTMLElement { return this.options.element; }
    setLngLat(): this { return this; }
    addTo(map: MockMap): this { map.getContainer().append(this.getElement()); return this; }
    remove(): void { this.getElement().remove(); }
  }
  class MockBounds {
    private empty = true;
    extend(): void { this.empty = false; }
    isEmpty(): boolean { return this.empty; }
  }
  return { default: { Map: MockMap, Marker: MockMarker, LngLatBounds: MockBounds, NavigationControl: class {} } };
});

const demoClient: DeliveryClient = {
  id: 'demo-001', name: 'Almacén El Puente', address: 'Av. Artigas 1200',
  latitude: -34.7301, longitude: -56.2181,
};

const activeDelivery: Delivery = {
  id: 'delivery-1', status: 'active', driver: { id: 2, name: 'Repartidor' },
  production_unit: { id: 7, name: 'UP Norte' }, vehicle_reference: null, loaded_quantity: 120,
  delivered_quantity: 0, returned_quantity: 0, remaining_quantity: 120,
  stops_summary: { total: 0, pending: 0, delivered: 0, not_delivered: 0 },
  started_at: '2026-09-29T12:00:00Z', closed_at: null, latest_location: null, stops: [],
  unit_balances: { rows: [{ unit: 'huevo', label: 'Huevos', eggs_per_unit: 1,
    loaded_amount: '120', delivered_amount: '0', remaining_amount: '120', loaded_eggs: 120, delivered_eggs: 0 }],
    unallocated_delivered_eggs: 0, unallocated_returned_eggs: 0 },
};

describe('DeliveryPage', () => {
  let page: DeliveryPage;
  let online: ReturnType<typeof signal<boolean>>;
  let driverPermissions: ReturnType<typeof signal<string[]>>;
  let location: { getCurrentPosition: ReturnType<typeof vi.fn<LocationService['getCurrentPosition']>> };
  let api: {
    start: ReturnType<typeof vi.fn>;
    clients: ReturnType<typeof vi.fn>;
    units: ReturnType<typeof vi.fn>;
    productionUnits: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    current: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn>;
    payment: ReturnType<typeof vi.fn>;
    rectifyPayment: ReturnType<typeof vi.fn>;
    rectifyStop: ReturnType<typeof vi.fn>;
    markers: ReturnType<typeof vi.fn>;
    locations: ReturnType<typeof vi.fn>;
  };
  let outbox: {
    claimLegacy: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    saveReferences: ReturnType<typeof vi.fn>;
    referencesFor: ReturnType<typeof vi.fn>;
  };
  let theme: { toggleLabel: ReturnType<typeof signal<string>>; toggleIcon: ReturnType<typeof signal<string>>; toggle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    online = signal(true);
    driverPermissions = signal(['can_start_deliveries', 'can_update_own_deliveries']);
    location = { getCurrentPosition: vi.fn<LocationService['getCurrentPosition']>().mockResolvedValue({ latitude: -34.7, longitude: -56.2 }) };
    let queue: DeliveryOutboxEntry[] = [];
    api = {
      start: vi.fn(() => of({ data: activeDelivery })),
      clients: vi.fn(() => of({ data: [demoClient] })),
      productionUnits: vi.fn(() => of({ data: [{ id: 7, name: 'UP Norte' }, { id: 8, name: 'UP Sur' }] })),
      units: vi.fn(() => of({ data: [
        { id: 'huevo', label: 'Huevos', category: 'huevos', eggs_per_unit: 1, default_unit_price: 100 },
        { id: 'maple', label: 'Maples (30 huevos)', category: 'maples', eggs_per_unit: 30, default_unit_price: 100 },
      ] })),
      load: vi.fn(() => of({ data: { ...activeDelivery, loaded_quantity: 150, remaining_quantity: 150,
        unit_balances: { ...activeDelivery.unit_balances, rows: [
          activeDelivery.unit_balances!.rows[0],
          { unit: 'maple', label: 'Maples (30 huevos)', eggs_per_unit: 30,
            loaded_amount: '1', delivered_amount: '0', remaining_amount: '1', loaded_eggs: 30, delivered_eggs: 0 },
        ] },
        loads: [{ id: 1, quantity: 120, type: 'initial', created_at: '2026-09-29T12:00:00Z' },
          { id: 2, quantity: 30, type: 'additional', created_at: '2026-09-29T12:10:00Z' }] } }).pipe(tap((response) => api.detail.mockReturnValue(of(response))))),
      stop: vi.fn(() => of({ data: {} })),
      close: vi.fn(() => of({ data: { ...activeDelivery, status: 'completed' } })),
      current: vi.fn(() => of({ data: [activeDelivery] })),
      detail: vi.fn(() => of({ data: activeDelivery })),
      payment: vi.fn(() => of({ data: [] })),
      rectifyPayment: vi.fn(() => of({ data: [] })),
      rectifyStop: vi.fn(() => of({ data: { despues: { saldo_huevos: 75 } } })),
      markers: vi.fn(() => of({ data: [], meta: { has_more: false, limit: 200 } })),
      locations: vi.fn(() => of({ data: { accepted: 0, duplicates: 0, pending: 0 } })),
    };
    outbox = {
      enqueue: vi.fn(async (entry, replacing) => {
        if (replacing) queue = queue.filter((row) => row.id !== replacing.id);
        const value = { ...entry, actorId: 2, id: crypto.randomUUID(), attempts: 0, createdAt: new Date().toISOString(), state: 'pending' };
        queue.push(value); return value;
      }),
      list: vi.fn(async () => [...queue].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
      claimLegacy: vi.fn().mockResolvedValue(undefined),
      reject: vi.fn(async (entry, error) => { queue = queue.map((row) => row.id === entry.id ? { ...row, state: 'needs_review', error } : row); }),
      retry: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
      remove: vi.fn(async (id) => { queue = queue.filter((row) => row.id !== id); }),
      saveReferences: vi.fn().mockResolvedValue(undefined),
      referencesFor: vi.fn().mockResolvedValue(null),
    };
    theme = { toggleLabel: signal('Cambiar a tema oscuro'), toggleIcon: signal('moon-outline'), toggle: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { user: () => ({ id: 2, name: 'Repartidor', roles: ['delivery'], permissions: driverPermissions() }) } },
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
        { provide: NetworkService, useValue: { online } },
        { provide: ServerHealthService, useValue: { state: signal<'checking' | 'online' | 'offline'>('checking'), start: vi.fn(), stop: vi.fn() } },
        { provide: ThemeService, useValue: theme },
        { provide: LocationService, useValue: location },
        { provide: MAPBOX_ACCESS_TOKEN, useValue: 'configured-for-unit-test' },
        { provide: DeliveriesApi, useValue: api },
        { provide: VehiclesApi, useValue: { available: vi.fn(() => of({ data: [{ id: 'vehicle-1', plate: 'ABC123', make: 'Fiat', model: 'Fiorino', availability: 'available', warnings: [] }] })) } },
        { provide: DeliveryOutboxService, useValue: outbox },
      ],
    });
    page = TestBed.runInInjectionContext(() => new DeliveryPage());
    page.startMode.set('loaded');
    page.units.set([{ id: 'huevo', label: 'Huevos', category: 'huevos', eggs_per_unit: 1, default_unit_price: 100 }, { id: 'maple', label: 'Maples (30 huevos)', category: 'maples', eggs_per_unit: 30, default_unit_price: 100 }]);
    page.startForm.controls.items.at(0).controls.unit.setValue('huevo');
    page.startForm.controls.production_unit_id.setValue(7);
    page.loadForm.controls.production_unit_id.setValue(7);
    page.productionUnits.set([{ id: 7, name: 'UP Norte' }, { id: 8, name: 'UP Sur' }]);
    page.startPin.setValue('0007');
    page.closePin.setValue('0007');
    page.selectedVehicleId.set('vehicle-1');
    page.delivery.set(activeDelivery);
  });

  afterEach(() => page.ngOnDestroy());

  it('lists confirmed deliveries and records, replaces, and voids a payment linked to the selected delivery', async () => {
    const stop: DeliveryStop = {
      id: 58, version: 1, client_reference: demoClient.id, client_name: 'Almacén El Puente',
      address: '', latitude: 0, longitude: 0, sequence: 2, status: 'delivered', delivered_quantity: 60,
      total_amount: '720.000', accounting_status: 'posted', visit_reason: null, notes: null,
      visited_at: '2026-09-29T13:42:00Z',
      items: [{ unit: 'maple', label: 'Maples (30 huevos)', amount: '2', eggs_per_unit: 30, eggs: 60 }],
    };
    const older = { ...stop, id: 57, client_name: 'Autoservicio Central', visited_at: '2026-09-29T13:18:00Z' };
    const pending = { ...older, id: 56, client_name: 'Cliente pendiente', status: 'pending' as const };
    const movement: CustomerMovement = {
      id: 'original-payment', type: 'payment', amount: '-720.000', currency: 'UYU', sequence: 1,
      balance_before: '720.000', balance_after: '0.000', customer_name: stop.client_name,
      customer_id: demoClient.id, actor: { name: 'Repartidor' }, payment_method: 'cash', payment_reference: null,
      occurred_at: '2026-09-29T13:43:00Z', created_at: '2026-09-29T13:43:00Z',
      operation_id: 'first-operation', delivery_stop_id: stop.id, reason: null,
    };
    let detail: Delivery = {
      ...activeDelivery, stops: [older, pending, stop],
      financial_summary: {
        currency: 'UYU', merchandise_amount: '720.000', collected_amount: '0.000', recorded_collected_amount: '0.000',
        account_delta: '720.000', by_method: { cash: '0.000', transfer: '0.000', other: '0.000' },
        legacy_unreconciled_count: 0, customers: [{
          customer_id: demoClient.id, customer_name: stop.client_name, merchandise_amount: '720.000',
          collected_amount: '0.000', account_delta: '720.000', balance_before: '0.000', balance_after: '720.000',
        }],
      },
    };
    api.detail.mockImplementation(() => of({ data: detail }));
    api.payment.mockImplementation(() => {
      detail = { ...detail, account_movements: [{ ...movement, id: 'standalone', delivery_stop_id: null, amount: '-20.000' }, movement] };
      return of({ data: [movement] });
    });
    const replacement = { ...movement, id: 'corrected-payment', amount: '-700.125' };
    api.rectifyPayment.mockImplementationOnce(() => throwError(() => new HttpErrorResponse({ status: 0 }))).mockImplementationOnce(() => {
      detail = { ...detail, account_movements: [{ ...movement, reversal_id: 'reversal' }, replacement] };
      return of({ data: [replacement] });
    }).mockImplementationOnce(() => {
      detail = { ...detail, account_movements: [{ ...movement, reversal_id: 'reversal' }, { ...replacement, reversal_id: 'second-reversal' }] };
      return of({ data: [] });
    });

    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.checkingDelivery()).toBe(false));
    fixture.componentInstance.selectPanel('summary');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const click = (selector: string) => {
      root.querySelector<HTMLButtonElement>(selector)!.click();
      fixture.detectChanges();
    };
    const change = (selector: string, value: string, event = 'input') => {
      const field = root.querySelector<HTMLInputElement>(selector)!;
      field.value = value;
      field.dispatchEvent(new Event(event, { bubbles: true }));
      fixture.detectChanges();
    };
    const openPayment = () => {
      click('.edit-delivery');
      click('.editor-tabs button:last-child');
    };
    const refresh = async () => {
      await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
      fixture.detectChanges();
    };
    expect(Array.from(root.querySelectorAll('.completed-deliveries .customer strong'), (name) => name.textContent))
      .toEqual(['Almacén El Puente', 'Autoservicio Central']);
    const totals = root.querySelector('[summary-finances] app-delivery-financial-summary');
    expect(totals?.textContent).toContain('Dinero cobrado');
    expect(totals?.querySelector('.customer-breakdown')).toBeNull();
    change('.delivery-search', 'almacen');
    expect(root.querySelectorAll('.completed-deliveries li')).toHaveLength(1);

    openPayment();
    change('app-delivery-stop-editor input[inputmode="decimal"]', '720');
    click('app-delivery-stop-editor button[type="submit"]');
    await refresh();
    const linked = api.payment.mock.calls[0];
    expect(linked[1]).toEqual(expect.objectContaining({
      client_reference: demoClient.id, delivery_stop_id: 58, amount: '720.000', client_event_id: linked[2],
    }));
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'payment', idempotencyKey: linked[2] }), undefined);
    expect(root.querySelector('.amounts')?.textContent).toContain('Cobrado $720');

    openPayment();
    change('app-delivery-stop-editor input[inputmode="decimal"]', '700,125');
    change('app-delivery-stop-editor textarea', 'Importe verificado');
    click('app-delivery-stop-editor button[type="submit"]');
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Cerrar rectificación"]')?.disabled).toBe(true);
    click('app-delivery-stop-editor button[type="submit"]');
    await refresh();
    expect(api.rectifyPayment).toHaveBeenNthCalledWith(1, activeDelivery.id, movement.id,
      { amount: '700.125', reason: 'Importe verificado' }, expect.any(String));
    expect(api.rectifyPayment.mock.calls[1]).toEqual(api.rectifyPayment.mock.calls[0]);
    expect(root.querySelector('.amounts')?.textContent).toContain('Cobrado $700,125');

    openPayment();
    change('app-delivery-stop-editor select:has(option[value="no"])', 'no', 'change');
    change('app-delivery-stop-editor textarea', 'No se recibió el pago');
    click('app-delivery-stop-editor button[type="submit"]');
    await refresh();
    expect(api.rectifyPayment).toHaveBeenNthCalledWith(3, activeDelivery.id, replacement.id,
      { amount: '0.000', reason: 'No se recibió el pago' }, expect.any(String));
    expect(root.querySelector('.amounts')?.textContent).toContain('Sin cobro');
    expect(api.stop).not.toHaveBeenCalled();
  });

  it('keeps the server page and searches all cached clients offline', () => {
    page.clients.set(Array.from({ length: 80 }, (_, index) => ({
      ...demoClient, id: String(index), name: `Cliente ${index}`,
    })));
    expect(page.visibleClients()).toHaveLength(80);
    page.cachedClients.set(page.clients()); online.set(false);
    page.search.set('Cliente 79');
    expect(page.visibleClients()).toHaveLength(1);
  });

  it('centers the map on demand after a location failure without recording the position', async () => {
    location.getCurrentPosition.mockRejectedValueOnce(new Error('Permití el acceso a tu ubicación para centrar el mapa.'));
    const fixture = TestBed.createComponent(DeliveryPage);
    try {
      fixture.detectChanges();
      await vi.waitFor(() => expect(fixture.componentInstance.checkingDelivery()).toBe(false));
      expect(location.getCurrentPosition).not.toHaveBeenCalled();

      fixture.componentInstance.selectPanel('map');
      fixture.detectChanges();
      await vi.waitFor(() => expect(fixture.componentInstance.locationError()).toContain('Permití el acceso'));
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('#map-panel [role="status"]')?.textContent).toContain('Permití el acceso');
      expect(mapCalls.create).toHaveBeenCalledWith(expect.objectContaining({ style: 'mapbox://styles/mapbox/streets-v12' }));
      expect(mapCalls.jumpTo).not.toHaveBeenCalled();
      root.querySelector<HTMLButtonElement>('.map-locate')!.click();

      await vi.waitFor(() => expect(mapCalls.jumpTo).toHaveBeenCalledWith({ center: [-56.2, -34.7], zoom: 17 }));
      expect(location.getCurrentPosition).toHaveBeenCalledTimes(2);
      expect(fixture.componentInstance.locationError()).toBeNull();

      fixture.componentInstance.selectPanel('clients');
      fixture.detectChanges();
      location.getCurrentPosition.mockResolvedValueOnce({ latitude: -34.71, longitude: -56.21 });
      fixture.componentInstance.selectPanel('map');
      fixture.detectChanges();
      await vi.waitFor(() => expect(mapCalls.jumpTo).toHaveBeenCalledWith({ center: [-56.21, -34.71], zoom: 17 }));

      expect(api.locations).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    } finally {
      fixture.destroy();
    }
  });

  it('keeps client markers usable in the expanded map and restores delivery controls without recreating it', async () => {
    api.markers.mockReturnValue(of({ data: [demoClient], meta: { has_more: false, limit: 200 } }));
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.checkingDelivery()).toBe(false));
    fixture.componentInstance.selectPanel('map');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => expect(root.querySelector('.delivery-client-pin')).not.toBeNull());
    fixture.detectChanges();
    const map = root.querySelector('.delivery-map');
    const normalToggle = root.querySelector<HTMLButtonElement>('button[aria-label="Solo mapa"]')!;
    normalToggle.click();
    fixture.detectChanges();

    expect(root.querySelector('ion-header.map-chrome-hidden')).not.toBeNull();
    expect(root.querySelector('main.map-chrome-hidden')).not.toBeNull();
    expect(root.querySelector('.bottom-nav.map-chrome-hidden')).not.toBeNull();
    expect(root.querySelector('.delivery-map')).toBe(map);
    root.querySelector<HTMLButtonElement>('.delivery-client-pin')!.click();
    await vi.waitFor(() => expect(fixture.componentInstance.selectedClient()?.id).toBe(demoClient.id));
    fixture.componentInstance.selectedClient.set(null);
    fixture.detectChanges();

    const restore = root.querySelector<HTMLButtonElement>('.map-focus-actions button')!;
    expect(restore.textContent).toContain('Mostrar controles');
    restore.click();
    fixture.detectChanges();
    expect(root.querySelector('.map-chrome-hidden')).toBeNull();
    expect(root.querySelector('.delivery-map')).toBe(map);
    expect(mapCalls.create).toHaveBeenCalledTimes(1);
    expect(mapCalls.resize).toHaveBeenCalled();
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('opens preparation from the choice and keeps quantities editable with the stepper', async () => {
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.checkingDelivery()).toBe(false));
    fixture.componentInstance.delivery.set(null);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.start-form')).toBeNull();
    root.querySelector<HTMLButtonElement>('.start-loaded')!.click();
    fixture.detectChanges();
    const form = root.querySelector('.start-form') as HTMLElement;
    expect(form.querySelectorAll('.start-load-line')).toHaveLength(1);
    expect(form.querySelector<HTMLSelectElement>('.start-load-line select')?.value).toBe('maple');
    const quantity = form.querySelector<HTMLInputElement>('.start-stepper input')!;
    quantity.value = '0,5';
    quantity.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(form.querySelector('output')?.textContent).toContain('15 huevos');
    form.querySelector<HTMLButtonElement>('.start-stepper button:last-child')!.click();
    fixture.detectChanges();
    expect(quantity.value).toBe('1,5');
    expect(form.querySelector('output')?.textContent).toContain('45 huevos');
    form.querySelector<HTMLButtonElement>('.start-stepper button:first-child')!.click();
    fixture.detectChanges();
    expect(quantity.value).toBe('0,5');
    form.querySelector<HTMLButtonElement>('.start-add')!.click();
    fixture.detectChanges();
    expect(form.querySelectorAll('.start-load-line')).toHaveLength(2);
    expect(document.activeElement).toBe(form.querySelector('.start-load-line:last-child select'));
    form.querySelector<HTMLButtonElement>('.start-load-line:last-child .remove-line')!.click();
    fixture.detectChanges();
    expect(form.querySelectorAll('.start-load-line')).toHaveLength(1);
    expect(document.activeElement).toBe(form.querySelector('.start-load-line select'));
    root.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
    expect(theme.toggle).toHaveBeenCalledOnce();
    expect(root.querySelector('.server-status ion-icon')?.getAttribute('name')).toBe('wifi-outline');
    fixture.componentInstance.delivery.set(activeDelivery);
    fixture.componentInstance.openLoad();
    fixture.detectChanges();
    expect(root.querySelector('.client-sheet .load-line')?.querySelectorAll('select,input,button')).toHaveLength(3);
    fixture.destroy();
  });

  it('starts without cargo using only the selected vehicle, optional odometer, and PIN', async () => {
    api.current.mockReturnValue(of({ data: [] }));
    api.start.mockReturnValue(of({ data: { ...activeDelivery, started_without_load: true, loaded_quantity: 0 } }));
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.checkingDelivery()).toBe(false));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.start-empty')!.click();
    fixture.detectChanges();
    expect(root.querySelector('#start-up')).toBeNull();
    expect(root.querySelector('#start-load-heading')).toBeNull();
    expect(root.querySelector('.start-load-notice')?.textContent).toContain('0 huevos');
    const vehicle = root.querySelector<HTMLSelectElement>('#start-vehicle')!;
    vehicle.value = 'vehicle-1';
    vehicle.dispatchEvent(new Event('change'));
    fixture.componentInstance.startOdometer.setValue('1250,5');
    driverPermissions.set(['can_update_own_deliveries']);
    fixture.detectChanges();
    const continueButton = root.querySelector<HTMLButtonElement>('.start-form button[type="submit"]')!;
    expect(continueButton.disabled).toBe(true);
    driverPermissions.set(['can_start_deliveries']);
    fixture.detectChanges();
    expect(continueButton.disabled).toBe(false);
    continueButton.click();
    fixture.detectChanges();
    expect(root.querySelector('#start-pin')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.pin-sheet .secondary-action')!.click();
    fixture.detectChanges();
    expect(root.querySelector('#start-pin')).toBeNull();
    expect(root.querySelector('#start-heading')?.textContent).toContain('Iniciar sin carga');
    expect(vehicle.value).toBe('vehicle-1');
    expect(api.start).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('.start-back')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.start-empty')!.click();
    fixture.detectChanges();
    expect(root.querySelector<HTMLSelectElement>('#start-vehicle')?.value).toBe('vehicle-1');
    root.querySelector<HTMLButtonElement>('.start-form button[type="submit"]')!.click();
    fixture.detectChanges();
    fixture.componentInstance.startPin.setValue('0007');
    root.querySelector<HTMLButtonElement>('.pin-sheet button[type="submit"]')!.click();
    await vi.waitFor(() => expect(fixture.componentInstance.panel()).toBe('map'));
    fixture.detectChanges();
    expect(api.start).toHaveBeenCalledWith({ start_without_load: true, vehicle_id: 'vehicle-1', odometer_km: '1250.5', pin: '0007' }, expect.any(String));
    expect(root.querySelector('#map-tab')?.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('.delivery-map')).not.toBeNull();
    fixture.destroy();
  });

  it('opens floating PIN confirmations only after requesting start or close', async () => {
    page.delivery.set(null);
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(outbox.saveReferences).toHaveBeenCalled());
    fixture.componentInstance.delivery.set(null);
    fixture.componentInstance.startMode.set('loaded');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#start-pin')).toBeNull();
    fixture.componentInstance.startForm.controls.production_unit_id.setValue(7);
    fixture.componentInstance.startForm.controls.items.at(0).controls.unit.setValue('huevo');
    fixture.componentInstance.startForm.controls.items.at(0).controls.amount.setValue('1');
    fixture.componentInstance.units.set([{ id: 'huevo', label: 'Huevos', category: 'huevos', eggs_per_unit: 1, default_unit_price: 100 }]);
    fixture.componentInstance.selectedVehicleId.set('vehicle-1');
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.start-form button[type="submit"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('#start-pin')?.closest('[role="dialog"]')).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>('#start-pin')?.type).toBe('password');
    expect(root.querySelector<HTMLInputElement>('#start-pin')?.inputMode).toBe('numeric');

    fixture.componentInstance.startConfirmation.set(false);
    fixture.componentInstance.delivery.set(activeDelivery);
    fixture.componentInstance.selectPanel('summary');
    fixture.detectChanges();
    expect(root.querySelector('#close-pin')).toBeNull();
    fixture.componentInstance.closeConfirmation.set(true);
    fixture.detectChanges();
    expect(root.querySelector('#close-pin')?.closest('[role="dialog"]')).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>('#close-pin')?.type).toBe('password');
    expect(root.querySelector<HTMLInputElement>('#close-pin')?.inputMode).toBe('numeric');
    fixture.destroy();
  });

  it('opens the map after confirming the start PIN and submits the close PIN from the summary', async () => {
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(outbox.saveReferences).toHaveBeenCalled());
    fixture.componentInstance.delivery.set(null);
    fixture.componentInstance.startMode.set('loaded');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.startForm.controls.production_unit_id.setValue(7);
    fixture.componentInstance.startForm.controls.items.at(0).controls.unit.setValue('huevo');
    fixture.componentInstance.startForm.controls.items.at(0).controls.amount.setValue('1');
    fixture.componentInstance.units.set([{ id: 'huevo', label: 'Huevos', category: 'huevos', eggs_per_unit: 1, default_unit_price: 100 }]);
    fixture.componentInstance.selectedVehicleId.set('vehicle-1');
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.start-form button[type="submit"]')!.click();
    fixture.detectChanges();
    api.start.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 401, error: { code: 'INVALID_PIN', message: 'El PIN no es válido.' },
    })));
    fixture.componentInstance.startPin.setValue('0008');
    root.querySelector<HTMLButtonElement>('.pin-sheet .primary-action')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('.pin-sheet [role="alert"]')?.textContent).toContain('El PIN no es válido.');
    expect(root.querySelector('.delivery-map')).toBeNull();

    fixture.componentInstance.startPin.setValue('0007');
    root.querySelector<HTMLButtonElement>('.pin-sheet .primary-action')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.start).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.startConfirmation()).toBe(false);
    expect(root.querySelector('#map-tab')?.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('.delivery-map')).not.toBeNull();

    fixture.componentInstance.selectPanel('summary');
    driverPermissions.set(['can_start_deliveries']);
    fixture.detectChanges();
    const closeButton = root.querySelector<HTMLButtonElement>('#summary-panel .close-button')!;
    expect(closeButton.disabled).toBe(true);
    driverPermissions.set(['can_update_own_deliveries']);
    fixture.detectChanges();
    expect(closeButton.disabled).toBe(false);
    closeButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.closePin.setValue('0007');
    root.querySelector<HTMLButtonElement>('.pin-dialog .danger-action')?.click();
    await fixture.whenStable();
    expect(api.close).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.closeConfirmation()).toBe(false);
    fixture.destroy();
  });

  it('keeps clients primary, shows honest unit details, and separates clients and summary', async () => {
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(outbox.saveReferences).toHaveBeenCalled());
    fixture.componentInstance.delivery.set({
      ...activeDelivery, loaded_quantity: 90, delivered_quantity: 30, remaining_quantity: 60,
      unit_balances: { rows: [
        { unit: 'huevo', label: 'Huevos', eggs_per_unit: 1, loaded_amount: '30', delivered_amount: '0', remaining_amount: '30', loaded_eggs: 30, delivered_eggs: 0 },
        { unit: 'maple', label: 'Maples (30 huevos)', eggs_per_unit: 30, loaded_amount: '2', delivered_amount: '1', remaining_amount: '1', loaded_eggs: 60, delivered_eggs: 30 },
      ], unallocated_delivered_eggs: 0, unallocated_returned_eggs: 0 },
      loads: [{ id: 1, quantity: 90, type: 'initial', created_at: '2026-09-29T12:00:00Z', items: [
        { unit: 'huevo', label: 'Huevos', category: 'huevos', amount: '30', eggs_per_unit: 1, eggs: 30 },
        { unit: 'maple', label: 'Maples (30 huevos)', category: 'maples', amount: '2', eggs_per_unit: 30, eggs: 60 },
      ] }],
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.panel()).toBe('clients');
    fixture.componentInstance.selectPanel('map'); fixture.detectChanges();
    const cards = root.querySelectorAll<HTMLButtonElement>('.metrics button');
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain('Huevos totales');
    expect(cards[0].querySelector('strong')?.textContent).toBe('90');
    expect(cards[2].querySelector('strong')?.textContent).toBe('60');

    cards[0].click();
    fixture.detectChanges();
    expect(root.querySelector('#metric-sheet-title')?.textContent).toBe('Huevos totales');
    expect(root.querySelectorAll('.unit-table tbody tr')[1]?.querySelector('td')?.textContent?.trim()).toBe('2');
    expect(root.querySelector('.metric-note')).toBeNull();
    root.querySelector<HTMLButtonElement>('.client-sheet .sheet-close')?.click();
    fixture.detectChanges();

    cards[1].click();
    fixture.detectChanges();
    expect(root.querySelector('#metric-sheet-title')?.textContent).toBe('Entregados');
    expect(root.querySelectorAll('.unit-table tbody tr')[1]?.querySelector('td')?.textContent?.trim()).toBe('1');
    expect(root.querySelector('.metric-note')).toBeNull();
    root.querySelector<HTMLButtonElement>('.client-sheet .sheet-close')?.click();
    fixture.detectChanges();

    cards[2].click();
    fixture.detectChanges();
    expect(root.querySelector('#metric-sheet-title')?.textContent).toBe('En vehículo');
    expect(root.querySelectorAll('.unit-table tbody tr')[1]?.querySelector('td')?.textContent?.trim()).toBe('1');

    expect(root.querySelector('ion-content .map-background[slot="fixed"] .delivery-map')).not.toBeNull();
    expect(root.querySelector('.map-panel .map-search')).toBeNull();
    expect(root.querySelector('.map-panel .section-heading')).toBeNull();
    expect(root.querySelector('.map-panel .count-pill')).toBeNull();
    expect(root.querySelector('.route-status')?.textContent).toContain('Recorrido 29/09/26');
    expect(root.querySelector('.route-status')?.textContent).toContain('Conectado');
    expect(root.querySelector('.delivery-page > .close-button')?.textContent).toContain('Agregar carga');

    fixture.componentInstance.selectPanel('clients');
    fixture.detectChanges();
    expect(root.querySelector('#clients-panel .client-list')).not.toBeNull();
    expect(root.querySelector('.route-status, .metrics, .delivery-page > .close-button, .map-background')).toBeNull();

    fixture.componentInstance.selectPanel('summary');
    fixture.detectChanges();
    expect(root.querySelector('#summary-panel .summary-card')).not.toBeNull();
    expect(root.querySelector('.route-status, .metrics, .delivery-page > .close-button, .map-background')).toBeNull();
    fixture.destroy();
  });

  it('loads the client catalog independently of the visits in the delivery', async () => {
    await page.ngAfterViewInit();
    expect(page.clients()).toEqual([demoClient]);
    expect(api.current).toHaveBeenCalledWith();
    expect(page.delivery()?.stops).toEqual([]);
    expect(page.completedStops()).toBe(0);
  });

  it('uses plus and minus to record the actual amount even above the loaded units', async () => {
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(outbox.saveReferences).toHaveBeenCalled());
    fixture.componentInstance.delivery.set({
      ...activeDelivery, loaded_quantity: 35, remaining_quantity: 35,
      unit_balances: { rows: [
        { unit: 'huevo', label: 'Huevos', eggs_per_unit: 1, loaded_amount: '5', delivered_amount: '0', remaining_amount: '5', loaded_eggs: 5, delivered_eggs: 0 },
        { unit: 'maple', label: 'Maples (30 huevos)', eggs_per_unit: 30, loaded_amount: '1', delivered_amount: '0', remaining_amount: '1', loaded_eggs: 30, delivered_eggs: 0 },
      ], unallocated_delivered_eggs: 0, unallocated_returned_eggs: 0 },
    });
    fixture.componentInstance.openClient(demoClient);
    fixture.detectChanges();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.delivery-unit-row');
    expect(rows).toHaveLength(2);
    const mapleButtons = rows[1].querySelectorAll<HTMLButtonElement>('button');
    mapleButtons[1].click();
    fixture.detectChanges();
    expect(rows[1].querySelector<HTMLInputElement>('.unit-stepper input')?.value).toBe('1');
    expect(mapleButtons[1].disabled).toBe(false);
    mapleButtons[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedStopEggs()).toBe(60);
    mapleButtons[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedStopEggs()).toBe(30);
    fixture.destroy();
  });

  it('sends selected presentations so the server calculates delivered eggs', async () => {
    const client = demoClient;
    api.detail.mockReturnValue(of({ data: {
      ...activeDelivery, delivered_quantity: 12, remaining_quantity: 108,
      unit_balances: { rows: [{ ...activeDelivery.unit_balances!.rows[0], delivered_amount: '12', remaining_amount: '108', delivered_eggs: 12 }],
        unallocated_delivered_eggs: 0, unallocated_returned_eggs: 0 },
      stops: [{ id: 1, client_reference: client.id, client_name: client.name, address: client.address,
        latitude: client.latitude, longitude: client.longitude, sequence: 1,
        status: 'delivered', delivered_quantity: 12, items: [{ unit: 'huevo', label: 'Huevos', amount: '12', eggs_per_unit: 1, eggs: 12 }], visit_reason: 'Entrega realizada',
        notes: null, visited_at: '2026-09-29T12:10:00Z' }],
    } }));
    page.openClient(client);
    page.paymentChoice.set('fiado');
    page.stopSelections.set({ 'huevo|1': 12 });
    await page.saveStop();
    expect(api.stop).toHaveBeenCalledWith('delivery-1', expect.objectContaining({
      client_reference: client.id, status: 'delivered', items: [{ unit: 'huevo', amount: '12', eggs_per_unit: 1, unit_price: 100 }],
    }), expect.any(String));
    expect(page.delivery()?.remaining_quantity).toBe(108);
    expect(page.selectedClient()).toBeNull();
  });

  it('retains a server rejection for review and restores confirmed stock', async () => {
    api.stop.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 403, error: { message: 'No autorizado' },
    })));
    page.openClient(demoClient);
    page.paymentChoice.set('fiado');
    page.stopSelections.set({ 'huevo|1': 1 });
    await page.saveStop();
    expect(outbox.reject).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stop' }), 'No autorizado');
    expect(page.error()).toBe('No autorizado');
    expect(page.delivery()?.remaining_quantity).toBe(120);
    expect(page.reviewEntries()).toHaveLength(1);
  });

  it('requires a reason for a visit without delivery and sends no units', async () => {
    page.openClient(demoClient);
    page.paymentChoice.set('fiado');
    page.stopMode.set('not_delivered');
    await page.saveStop();
    expect(api.stop).not.toHaveBeenCalled();
    expect(page.error()).toContain('por qué');
    page.stopForm.controls.reason.setValue('Negocio cerrado');
    await page.saveStop();
    expect(api.stop).toHaveBeenCalledWith('delivery-1', expect.objectContaining({
      status: 'not_delivered', visit_reason: 'Negocio cerrado',
    }), expect.any(String));
    expect(api.stop.mock.calls[0][1]).not.toHaveProperty('delivered_quantity');
  });

  it('does not invent presentation balances for an older active delivery', async () => {
    page.delivery.set({ ...activeDelivery, delivered_quantity: 4, remaining_quantity: 116,
      unit_balances: { rows: [{ ...activeDelivery.unit_balances!.rows[0], remaining_amount: null }],
        unallocated_delivered_eggs: 4, unallocated_returned_eggs: 0 } });
    page.openClient(demoClient);
    page.paymentChoice.set('fiado');
    expect(page.canIncrementStopUnit(page.delivery()!.unit_balances!.rows[0])).toBe(false);
    await page.saveStop();
    expect(api.stop).not.toHaveBeenCalled();
    expect(page.error()).toContain('presentación');
  });

  it('queues a network failure and keeps the actual negative balance visible locally', async () => {
    api.stop.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const client = demoClient;
    page.openClient(client);
    page.paymentChoice.set('fiado');
    page.stopSelections.set({ 'huevo|1': 122 });
    await page.saveStop();
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stop' }), undefined);
    expect(page.statusFor(client)).toBe('delivered');
    expect(page.delivery()?.remaining_quantity).toBe(-2);
    expect(page.delivery()?.unit_balances?.rows[0].remaining_amount).toBe('-2');
  });

  it('adds an online load to the current delivery', async () => {
    page.openLoad();
    page.loadForm.controls.production_unit_id.setValue(7);
    page.loadForm.controls.items.at(0).patchValue({ unit: 'maple', amount: '1' });
    await page.addLoad();
    expect(api.load).toHaveBeenCalledWith('delivery-1', expect.objectContaining({ production_unit_id: 7, items: [
      { unit: 'maple', amount: '1', eggs_per_unit: 30 },
    ], occurred_at: expect.any(String) }), expect.any(String));
    expect(page.delivery()?.loaded_quantity).toBe(150);
    expect(page.delivery()?.remaining_quantity).toBe(150);
    expect(page.loadOpen()).toBe(false);
  });

  it('queues an offline load and makes its eggs available locally', async () => {
    online.set(false);
    page.openLoad();
    page.loadForm.controls.production_unit_id.setValue(7);
    page.loadForm.controls.items.at(0).patchValue({ unit: 'maple', amount: '1' });
    await page.addLoad();
    expect(api.load).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'load', payload: expect.objectContaining({ production_unit_id: 7, items: [{ unit: 'maple', amount: '1', eggs_per_unit: 30 }], occurred_at: expect.any(String) }),
    }), undefined);
    expect(page.delivery()?.loaded_quantity).toBe(150);
    expect(page.delivery()?.remaining_quantity).toBe(150);
    expect(page.loadedPresentations().maples).toBe(1);
    expect(page.delivery()?.unit_balances?.rows[1].remaining_amount).toBe('1');
    expect(outbox.saveReferences).toHaveBeenLastCalledWith(expect.objectContaining({
      actorId: 2, delivery: expect.objectContaining({ loaded_quantity: 150, remaining_quantity: 150 }),
    }));
    page.openClient(demoClient);
    page.paymentChoice.set('fiado');
    page.stopSelections.set({ 'maple|30': 1 });
    await page.saveStop();
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'stop', payload: expect.objectContaining({ items: [{ unit: 'maple', amount: '1', eggs_per_unit: 30, unit_price: 100 }] }),
    }), undefined);
    expect(page.delivery()?.unit_balances?.rows[1].remaining_amount).toBe('0');
    expect(page.delivery()?.remaining_quantity).toBe(120);
    expect(outbox.saveReferences).toHaveBeenLastCalledWith(expect.objectContaining({
      actorId: 2, delivery: expect.objectContaining({ loaded_quantity: 150, remaining_quantity: 120 }),
    }));
  });

  it('restores the catalogue, clients, active delivery and queue count without a connection', async () => {
    online.set(false);
    outbox.referencesFor.mockResolvedValue({
      actorId: 2, units: page.units(), productionUnits: page.productionUnits(), clients: [demoClient],
      delivery: { ...activeDelivery, loaded_quantity: 150, remaining_quantity: 108 },
    });
    outbox.list.mockResolvedValue([{ id: 'one', kind: 'load' }, { id: 'two', kind: 'payment' }]);
    page.delivery.set(null);
    page.units.set([]);
    page.productionUnits.set([]);
    await page.ngAfterViewInit();
    expect(page.units()).toHaveLength(2);
    expect(page.productionUnits()).toHaveLength(2);
    expect(page.clients()).toEqual([demoClient]);
    expect(page.delivery()?.remaining_quantity).toBe(108);
    expect(page.pendingCount()).toBe(2);
    expect(api.current).not.toHaveBeenCalled();
    expect(api.units).not.toHaveBeenCalled();
  });

  it('starts with fractional presentations when the LAN browser lacks randomUUID', async () => {
    page.delivery.set(null);
    page.panel.set('clients');
    page.startForm.controls.items.at(0).patchValue({ unit: 'maple', amount: '0,5' });
    page.addLine(page.startForm);
    page.startForm.controls.items.at(1).patchValue({ unit: 'huevo', amount: '5' });
    expect(page.formEggs(page.startForm)).toBe(20);
    const webCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: webCrypto.getRandomValues.bind(webCrypto) });
    try {
      await page.startDelivery();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(api.start).toHaveBeenCalledWith({ pin: '0007', vehicle_id: 'vehicle-1', production_unit_id: 7, items: [
      { unit: 'maple', amount: '0.5', eggs_per_unit: 30 },
      { unit: 'huevo', amount: '5', eggs_per_unit: 1 },
    ] }, expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
    expect(page.panel()).toBe('map');
  });

  it('rejects a fraction that cannot become whole eggs', async () => {
    page.openLoad();
    page.loadForm.controls.production_unit_id.setValue(7);
    page.loadForm.controls.items.at(0).patchValue({ unit: 'huevo', amount: '0,5' });
    await page.addLoad();
    expect(api.load).not.toHaveBeenCalled();
    expect(page.error()).toContain('huevos enteros');
  });

  it('retains a rejected conversion for manual correction', async () => {
    api.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: {
      message: 'Los datos proporcionados no son válidos.',
      errors: { 'items.0.eggs_per_unit': ['La equivalencia cambió.'] },
    } })));
    page.openLoad();
    page.loadForm.controls.production_unit_id.setValue(7);
    await page.addLoad();
    expect(page.error()).toBe('La equivalencia cambió.');
    expect(outbox.reject).toHaveBeenCalledWith(expect.objectContaining({ kind: 'load' }), 'La equivalencia cambió.');
  });

  it('reapplies a queued load after refresh without counting an accepted load twice', async () => {
    outbox.list.mockResolvedValue([{
      id: 'local-load', kind: 'load', deliveryId: 'delivery-1',
      payload: { quantity: 30 }, idempotencyKey: 'load-key', createdAt: '2026-09-29T12:01:00Z',
    }]);
    await page.ngAfterViewInit();
    expect(page.delivery()?.loaded_quantity).toBe(150);
    api.detail.mockReturnValue(of({ data: {
      ...activeDelivery, loaded_quantity: 150, remaining_quantity: 150,
      loads: [{ id: 2, quantity: 30, type: 'additional',
        idempotency_key: 'load-key', created_at: '2026-09-29T12:01:00Z' }],
    } }));
    await page.ngAfterViewInit();
    expect(page.delivery()?.loaded_quantity).toBe(150);
  });

  it('requires a PIN for starting and closing, without calling the API otherwise', async () => {
    page.delivery.set(null);
    page.startPin.reset();
    await page.startDelivery();
    expect(api.start).not.toHaveBeenCalled();
    expect(page.error()).toContain('PIN');

    page.delivery.set(activeDelivery);
    page.closePin.reset();
    await page.closeDelivery();
    expect(api.close).not.toHaveBeenCalled();
    expect(page.error()).toContain('PIN');
  });

  it('keeps an offline close unconfirmed without storing the PIN', async () => {
    online.set(false);
    page.pendingCount.set(2);
    await page.closeDelivery();
    expect(api.close).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(page.closePin.value).toBe('');
    expect(page.error()).toContain('conexión');
  });

  it('sends the PIN to close, clears it, and never queues a rejected PIN', async () => {
    await page.closeDelivery();
    expect(api.close).toHaveBeenCalledWith('delivery-1', {
      returned_items: [{ unit: 'huevo', amount: '120', eggs_per_unit: 1 }], return_production_unit_id: 7, notes: 'Cierre desde modo repartidor', pin: '0007',
    }, expect.any(String));
    expect(page.delivery()?.status).toBe('completed');
    expect(page.closePin.value).toBe('');

    page.delivery.set(activeDelivery);
    page.closePin.setValue('9999');
    api.close.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 401, error: { code: 'INVALID_PIN', message: 'El PIN no es válido.' },
    })));
    await page.closeDelivery();
    expect(page.delivery()?.status).toBe('active');
    expect(page.error()).toBe('El PIN no es válido.');
    expect(page.closePin.value).toBe('');
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('sends zero returned quantity when the balance is zero', async () => {
    page.delivery.set({
      ...activeDelivery,
      delivered_quantity: 120,
      remaining_quantity: 0,
      unit_balances: { ...activeDelivery.unit_balances!, rows: [{
        ...activeDelivery.unit_balances!.rows[0], delivered_amount: '120', remaining_amount: '0', delivered_eggs: 120,
      }] },
    });

    await page.closeDelivery();

    expect(api.close).toHaveBeenCalledWith('delivery-1', expect.objectContaining({ returned_quantity: 0, pin: '0007' }), expect.any(String));
  });

  it('requires a rectification before closing a delivery with negative balance', async () => {
    page.delivery.set({ ...activeDelivery, delivered_quantity: 122, remaining_quantity: -2 });

    await page.closeDelivery();

    expect(api.close).not.toHaveBeenCalled();
    expect(page.error()).toContain('Un administrador debe rectificar la entrega antes del cierre.');
  });

  it('replays queued loads and visits but asks for a PIN to close a legacy queued delivery', async () => {
    const sent: string[] = [];
    api.load.mockImplementation(() => { sent.push('load'); return of({ data: { ...activeDelivery, loaded_quantity: 150 } }); });
    api.stop.mockImplementation(() => { sent.push('stop'); return of({ data: {} }); });
    api.close.mockImplementation(() => { sent.push('close'); return of({ data: { ...activeDelivery, status: 'completed' } }); });
    api.current.mockReturnValue(of({ data: [activeDelivery] }));
    outbox.list.mockResolvedValue([
      { id: 'close', kind: 'close', deliveryId: 'delivery-1', payload: { returned_quantity: 108 },
        idempotencyKey: 'close-key', createdAt: '2026-09-29T12:02:00Z' },
      { id: 'stop', kind: 'stop', deliveryId: 'delivery-1',
        payload: { client_reference: 'demo-001', status: 'delivered',
          items: [{ unit: 'huevo', amount: '12', eggs_per_unit: 1 }] },
        idempotencyKey: 'stop-key', createdAt: '2026-09-29T12:01:00Z' },
      { id: 'load', kind: 'load', deliveryId: 'delivery-1', payload: { quantity: 30 },
        idempotencyKey: 'load-key', createdAt: '2026-09-29T12:00:00Z' },
    ]);
    await page.syncNow();
    expect(sent).toEqual(['stop', 'load']);
    expect(outbox.remove).not.toHaveBeenCalledWith('close');
    expect(page.delivery()?.status).toBe('active');
    expect(api.close).not.toHaveBeenCalled();
  });
  it('requires a selected UP and sends the chosen recharge origin', async () => {
    page.openLoad();
    page.loadForm.controls.items.at(0).patchValue({ unit: 'maple', amount: '0.5' });
    await page.addLoad();
    expect(api.load).not.toHaveBeenCalled();
    expect(page.error()).toContain('unidad productiva');
    page.loadForm.controls.production_unit_id.setValue(8);
    await page.addLoad();
    expect(api.load).toHaveBeenCalledWith('delivery-1', expect.objectContaining({
      production_unit_id: 8, items: [{ unit: 'maple', amount: '0.5', eggs_per_unit: 30 }], occurred_at: expect.any(String),
    }), expect.any(String));
  });

  it('accepts fractional units and integer price overrides without computing a server total', async () => {
    page.units.set([{ id: 'crate', label: 'Cajón', category: 'custom', eggs_per_unit: 360, default_unit_price: 200 }]);
    const row = { unit: 'crate', label: 'Cajón', eggs_per_unit: 360, loaded_amount: '1', delivered_amount: '0',
      remaining_amount: '1', loaded_eggs: 360, delivered_eggs: 0 };
    page.delivery.set({ ...activeDelivery, loaded_quantity: 360, remaining_quantity: 360,
      unit_balances: { rows: [row], unallocated_delivered_eggs: 0, unallocated_returned_eggs: 0 } });
    page.openClient(demoClient);
    page.paymentChoice.set('fiado');
    const input = document.createElement('input');
    input.value = '0,125';
    page.setStopAmount(row, { target: input } as unknown as Event);
    page.priceControl(row).setValue('101');
    expect(page.selectedStopEggs()).toBe(45);
    await page.saveStop();
    expect(api.stop).toHaveBeenCalledWith('delivery-1', expect.objectContaining({
      items: [{ unit: 'crate', amount: '0.125', eggs_per_unit: 360, unit_price: 101 }],
    }), expect.any(String));
    expect(api.stop.mock.calls[0][1]).not.toHaveProperty('total_amount');
  });

  it('rejects fractional unit prices before recording or queuing an operation', async () => {
    const row = activeDelivery.unit_balances!.rows[0];
    page.openClient(demoClient);
    page.paymentChoice.set('fiado');
    page.adjustStopUnit(row, 1);
    page.priceControl(row).setValue('100.01');
    await page.saveStop();
    expect(api.stop).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(page.error()).toContain('pesos enteros');
  });

  it('sends the normalized comma quantity even when it exceeds the presentation balance', async () => {
    const row = { unit: 'maple', label: 'Maple', eggs_per_unit: 30, loaded_amount: '0.5', delivered_amount: '0',
      remaining_amount: '0.5', loaded_eggs: 15, delivered_eggs: 0 };
    page.delivery.set({ ...activeDelivery, unit_balances: { ...activeDelivery.unit_balances!, rows: [row] } });
    page.openClient(demoClient);
    page.paymentChoice.set('fiado');
    const input = document.createElement('input');
    input.value = '0,6';
    page.setStopAmount(row, { target: input } as unknown as Event);
    page.priceControl(row).setValue('80');
    await page.saveStop();
    expect(api.stop).toHaveBeenCalledWith('delivery-1', expect.objectContaining({
      items: [{ unit: 'maple', eggs_per_unit: 30, amount: '0.6', unit_price: 80 }],
    }), expect.any(String));
  });

  it('requires one return destination when multiple UPs participated', async () => {
    page.delivery.set({ ...activeDelivery, loads: [
      { id: 1, quantity: 60, type: 'initial', created_at: '', production_unit: { id: 7, name: 'UP Norte' } },
      { id: 2, quantity: 60, type: 'additional', created_at: '', production_unit: { id: 8, name: 'UP Sur' } },
    ] });
    await page.closeDelivery();
    expect(api.close).not.toHaveBeenCalled();
    expect(page.error()).toContain('UP');
    page.returnUnit.setValue(8);
    await page.closeDelivery();
    expect(api.close).toHaveBeenCalledWith('delivery-1', expect.objectContaining({
      return_production_unit_id: 8, returned_items: [{ unit: 'huevo', amount: '120', eggs_per_unit: 1 }],
    }), expect.any(String));
  });

  it('keeps the delivery active when the final return omits leftover eggs', async () => {
    await page.openCloseConfirmation();
    page.returnAmounts.at(0).setValue('119');
    await page.closeDelivery();
    expect(api.close).not.toHaveBeenCalled();
    expect(page.delivery()?.status).toBe('active');
    expect(page.error()).toContain('todos los huevos sobrantes');
  });

  it('requires an explicit fiado or payment choice before recording goods', async () => {
    page.openClient(demoClient); page.stopSelections.set({ 'huevo|1': 1 });
    await page.saveStop();
    expect(outbox.enqueue).not.toHaveBeenCalled(); expect(page.error()).toContain('fiada');
    page.paymentChoice.set('fiado'); await page.saveStop();
    const payload = api.stop.mock.calls[0][1]; const key = api.stop.mock.calls[0][2];
    expect(payload).toMatchObject({ accounting_version: 2, client_event_id: key, payment: { amount: '0.000' } });
  });

  it('records multiple standalone payments without modifying stock or blocking a later delivery', async () => {
    for (const amount of ['150,125', '20']) {
      page.openClient(demoClient); page.stopMode.set('payment');
      page.stopForm.patchValue({ amount, payment_method: 'transfer', payment_reference: 'Banco' });
      await page.saveStop();
    }
    expect(api.payment).toHaveBeenCalledTimes(2); expect(api.stop).not.toHaveBeenCalled();
    expect(api.payment.mock.calls[0][1]).toMatchObject({ client_reference: demoClient.id, amount: '150.125', payment_method: 'transfer', payment_reference: 'Banco' });
    expect(api.payment.mock.calls[0][1].client_event_id).toBe(api.payment.mock.calls[0][2]);
    expect(api.payment.mock.calls[0][2]).not.toBe(api.payment.mock.calls[1][2]);
    expect(page.delivery()?.remaining_quantity).toBe(120); expect(page.statusFor(demoClient)).toBe('pending');
  });

  it('never sends a business operation when the durable commit fails', async () => {
    outbox.enqueue.mockRejectedValue(new Error('Almacenamiento lleno'));
    page.openClient(demoClient); page.paymentChoice.set('fiado'); page.stopSelections.set({ 'huevo|1': 1 });
    await page.saveStop();
    expect(api.stop).not.toHaveBeenCalled(); expect(page.error()).toBe('Almacenamiento lleno');
    expect(page.selectedClient()?.id).toBe(demoClient.id); expect(page.delivery()?.remaining_quantity).toBe(120);
    expect(page.message()).toBeNull();
  });

  it('preserves the same key after a lost payment response and stops automatic retries after a permanent rejection', async () => {
    api.payment.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    page.openClient(demoClient); page.stopMode.set('payment'); page.stopForm.controls.amount.setValue('100');
    await page.saveStop();
    const key = api.payment.mock.calls[0][2]; expect(page.pendingCount()).toBe(1);
    api.payment.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Revisá el cliente' } })));
    await page.syncNow(); expect(api.payment.mock.calls[1][2]).toBe(key);
    expect(page.reviewEntries()).toHaveLength(1); await page.syncNow();
    expect(api.payment).toHaveBeenCalledTimes(2); expect(page.pendingCount()).toBe(1);
  });

  it('navigates past the first 100 clients using server pagination', async () => {
    api.clients.mockReturnValue(of({ data: [{ ...demoClient, id: 'customer-151' }], meta: { current_page: 4, last_page: 4, total: 151, per_page: 50 } }));
    await page.refreshClients('', 4);
    expect(api.clients).toHaveBeenCalledWith('', 4, undefined); expect(page.visibleClients()[0].id).toBe('customer-151');
    expect(page.clientPage()).toBe(4); expect(page.clientTotal()).toBe(151);
  });

  it('previews fractional merchandise and credit balances exactly', () => {
    const row = { unit: 'crate', label: 'Cajón', eggs_per_unit: 24, loaded_amount: '1', delivered_amount: '0', remaining_amount: '1', loaded_eggs: 24, delivered_eggs: 0 };
    page.delivery.set({ ...activeDelivery, unit_balances: { rows: [row], unallocated_delivered_eggs: 0, unallocated_returned_eggs: 0 } });
    page.openClient({ ...demoClient, account: { balance: '10.000', debt: '10.000', credit: '0.000', version: 1, currency: 'UYU', as_of: '2026-10-29T17:00:00Z' } });
    page.stopSelections.set({ 'crate|24': 0.125 }); page.priceControl(row).setValue('101');
    page.paymentChoice.set('payment'); page.stopForm.controls.amount.setValue('25');
    expect(page.preview()).toEqual({ charge: '12.625', paid: '25.000', after: '-2.375' });
  });

});
