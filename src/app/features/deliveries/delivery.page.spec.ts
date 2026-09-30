import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../core/auth/auth.store';
import { LocationService } from '../../core/native/location.service';
import { NetworkService } from '../../core/native/network.service';
import { ThemeService } from '../../core/theme/theme.service';
import { DeliveryOutboxService } from './delivery-outbox.service';
import { DeliveryPage } from './delivery.page';
import { DeliveriesApi } from './deliveries.api';
import { Delivery, DeliveryClient } from './delivery.models';

const demoClient: DeliveryClient = {
  id: 'demo-001', name: 'Almacén El Puente', address: 'Av. Artigas 1200',
  latitude: -34.7301, longitude: -56.2181,
};

const activeDelivery: Delivery = {
  id: 'delivery-1', status: 'active', driver: { id: 2, name: 'Repartidor' },
  production_unit: null, vehicle_reference: null, loaded_quantity: 120,
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
  let api: {
    start: ReturnType<typeof vi.fn>;
    clients: ReturnType<typeof vi.fn>;
    units: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    current: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn>;
    locations: ReturnType<typeof vi.fn>;
  };
  let outbox: {
    enqueue: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let theme: { toggleLabel: ReturnType<typeof signal<string>>; toggleIcon: ReturnType<typeof signal<string>>; toggle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    online = signal(true);
    api = {
      start: vi.fn(() => of({ data: activeDelivery })),
      clients: vi.fn(() => of({ data: [demoClient] })),
      units: vi.fn(() => of({ data: [
        { id: 'huevo', label: 'Huevos', category: 'huevos', eggs_per_unit: 1 },
        { id: 'maple', label: 'Maples (30 huevos)', category: 'maples', eggs_per_unit: 30 },
      ] })),
      load: vi.fn(() => of({ data: { ...activeDelivery, loaded_quantity: 150, remaining_quantity: 150,
        unit_balances: { ...activeDelivery.unit_balances, rows: [
          activeDelivery.unit_balances!.rows[0],
          { unit: 'maple', label: 'Maples (30 huevos)', eggs_per_unit: 30,
            loaded_amount: '1', delivered_amount: '0', remaining_amount: '1', loaded_eggs: 30, delivered_eggs: 0 },
        ] },
        loads: [{ id: 1, quantity: 120, type: 'initial', created_at: '2026-09-29T12:00:00Z' },
          { id: 2, quantity: 30, type: 'additional', created_at: '2026-09-29T12:10:00Z' }] } })),
      stop: vi.fn(() => of({ data: {} })),
      close: vi.fn(() => of({ data: { ...activeDelivery, status: 'completed' } })),
      current: vi.fn(() => of({ data: [activeDelivery] })),
      detail: vi.fn(() => of({ data: activeDelivery })),
      locations: vi.fn(() => of({ data: { accepted: 0, duplicates: 0, pending: 0 } })),
    };
    outbox = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    theme = { toggleLabel: signal('Cambiar a tema oscuro'), toggleIcon: signal('moon-outline'), toggle: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { user: signal({ id: 2, name: 'Repartidor', roles: ['delivery'] }) } },
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
        { provide: NetworkService, useValue: { online } },
        { provide: ThemeService, useValue: theme },
        { provide: LocationService, useValue: { clearWatch: vi.fn(), requestPermission: vi.fn(), watch: vi.fn() } },
        { provide: DeliveriesApi, useValue: api },
        { provide: DeliveryOutboxService, useValue: outbox },
      ],
    });
    page = TestBed.runInInjectionContext(() => new DeliveryPage());
    page.units.set([{ id: 'huevo', label: 'Huevos', category: 'huevos', eggs_per_unit: 1 }, { id: 'maple', label: 'Maples (30 huevos)', category: 'maples', eggs_per_unit: 30 }]);
    page.startForm.controls.items.at(0).controls.unit.setValue('huevo');
    page.startPin.setValue('0007');
    page.closePin.setValue('0007');
    page.delivery.set(activeDelivery);
  });

  afterEach(() => page.ngOnDestroy());

  it('shows only up to 50 searched clients', () => {
    page.clients.set(Array.from({ length: 80 }, (_, index) => ({
      ...demoClient, id: String(index), name: `Cliente ${index}`,
    })));
    expect(page.visibleClients()).toHaveLength(50);
    page.search.set('Cliente 79');
    expect(page.visibleClients()).toHaveLength(1);
  });

  it('renders three compact controls per load row and the shared theme toggle', async () => {
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const form = root.querySelector('.idle-card .stock-form') as HTMLElement;
    expect(form.querySelectorAll('.load-line')).toHaveLength(1);
    expect(form.querySelector('.load-line')?.querySelectorAll('select,input,button')).toHaveLength(3);
    form.querySelector<HTMLButtonElement>('.secondary-action')?.click();
    fixture.detectChanges();
    expect(form.querySelectorAll('.load-line')).toHaveLength(2);
    form.querySelector<HTMLButtonElement>('.load-line:last-child .remove-line')?.click();
    fixture.detectChanges();
    expect(form.querySelectorAll('.load-line')).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
    expect(theme.toggle).toHaveBeenCalledOnce();
    fixture.componentInstance.delivery.set(activeDelivery);
    fixture.componentInstance.openLoad();
    fixture.detectChanges();
    expect(root.querySelector('.client-sheet .load-line')?.querySelectorAll('select,input,button')).toHaveLength(3);
    fixture.destroy();
  });

  it('opens floating PIN confirmations only after requesting start or close', async () => {
    page.delivery.set(null);
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#start-pin')).toBeNull();
    root.querySelector<HTMLButtonElement>('.idle-card .primary-action')?.click();
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

  it('submits the PIN from each floating confirmation', async () => {
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.delivery.set(null);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.idle-card .primary-action')?.click();
    fixture.detectChanges();
    fixture.componentInstance.startPin.setValue('0007');
    root.querySelector<HTMLButtonElement>('.pin-sheet .primary-action')?.click();
    await fixture.whenStable();
    expect(api.start).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.startConfirmation()).toBe(false);

    fixture.componentInstance.selectPanel('summary');
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('#summary-panel .close-button')?.click();
    fixture.detectChanges();
    fixture.componentInstance.closePin.setValue('0007');
    root.querySelector<HTMLButtonElement>('.pin-dialog .danger-action')?.click();
    await fixture.whenStable();
    expect(api.close).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.closeConfirmation()).toBe(false);
    fixture.destroy();
  });

  it('keeps the map primary, shows honest unit details, and separates clients and summary', async () => {
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
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
    expect(fixture.componentInstance.panel()).toBe('map');
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
    expect(root.querySelector('.map-panel .map-search')).not.toBeNull();
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
    expect(page.delivery()?.stops).toEqual([]);
    expect(page.completedStops()).toBe(0);
  });

  it('uses plus and minus per presentation without exceeding the real loaded units', async () => {
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
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
    expect(rows[1].querySelector('output')?.textContent).toBe('1');
    expect(mapleButtons[1].disabled).toBe(true);
    expect(fixture.componentInstance.selectedStopEggs()).toBe(30);
    mapleButtons[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedStopEggs()).toBe(0);
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
    page.stopSelections.set({ 'huevo|1': 12 });
    await page.saveStop();
    expect(api.stop).toHaveBeenCalledWith('delivery-1', expect.objectContaining({
      client_reference: client.id, status: 'delivered', items: [{ unit: 'huevo', amount: '12', eggs_per_unit: 1 }],
    }), expect.any(String));
    expect(page.delivery()?.remaining_quantity).toBe(108);
    expect(page.selectedClient()).toBeNull();
  });

  it('never queues a server rejection as an offline success', async () => {
    api.stop.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 403, error: { message: 'No autorizado' },
    })));
    page.openClient(demoClient);
    page.stopSelections.set({ 'huevo|1': 1 });
    await page.saveStop();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(page.error()).toBe('No autorizado');
    expect(page.selectedClient()).not.toBeNull();
  });

  it('requires a reason for a visit without delivery and sends no units', async () => {
    page.openClient(demoClient);
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
    expect(page.canIncrementStopUnit(page.delivery()!.unit_balances!.rows[0])).toBe(false);
    await page.saveStop();
    expect(api.stop).not.toHaveBeenCalled();
    expect(page.error()).toContain('presentación');
  });

  it('queues a network failure and keeps the visit visible locally', async () => {
    api.stop.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const client = demoClient;
    page.openClient(client);
    page.stopSelections.set({ 'huevo|1': 12 });
    await page.saveStop();
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stop' }));
    expect(page.statusFor(client)).toBe('delivered');
    expect(page.delivery()?.remaining_quantity).toBe(108);
    expect(page.delivery()?.unit_balances?.rows[0].remaining_amount).toBe('108');
  });

  it('adds an online load to the current delivery', async () => {
    page.openLoad();
    page.loadForm.controls.items.at(0).patchValue({ unit: 'maple', amount: '1' });
    await page.addLoad();
    expect(api.load).toHaveBeenCalledWith('delivery-1', { items: [
      { unit: 'maple', amount: '1', eggs_per_unit: 30 },
    ] }, expect.any(String));
    expect(page.delivery()?.loaded_quantity).toBe(150);
    expect(page.delivery()?.remaining_quantity).toBe(150);
    expect(page.loadOpen()).toBe(false);
  });

  it('queues an offline load and makes its eggs available locally', async () => {
    online.set(false);
    page.openLoad();
    page.loadForm.controls.items.at(0).patchValue({ unit: 'maple', amount: '1' });
    await page.addLoad();
    expect(api.load).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'load', payload: { items: [{ unit: 'maple', amount: '1', eggs_per_unit: 30 }] },
    }));
    expect(page.delivery()?.loaded_quantity).toBe(150);
    expect(page.delivery()?.remaining_quantity).toBe(150);
    expect(page.loadedPresentations().maples).toBe(1);
    expect(page.delivery()?.unit_balances?.rows[1].remaining_amount).toBe('1');
    page.openClient(demoClient);
    page.stopSelections.set({ 'maple|30': 1 });
    await page.saveStop();
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'stop', payload: expect.objectContaining({ items: [{ unit: 'maple', amount: '1', eggs_per_unit: 30 }] }),
    }));
    expect(page.delivery()?.unit_balances?.rows[1].remaining_amount).toBe('0');
    expect(page.delivery()?.remaining_quantity).toBe(120);
  });

  it('accepts half a maple and combines it with loose eggs', async () => {
    page.delivery.set(null);
    page.panel.set('clients');
    page.startForm.controls.items.at(0).patchValue({ unit: 'maple', amount: '0,5' });
    page.addLine(page.startForm);
    page.startForm.controls.items.at(1).patchValue({ unit: 'huevo', amount: '5' });
    expect(page.formEggs(page.startForm)).toBe(20);
    await page.startDelivery();
    expect(api.start).toHaveBeenCalledWith({ pin: '0007', items: [
      { unit: 'maple', amount: '0.5', eggs_per_unit: 30 },
      { unit: 'huevo', amount: '5', eggs_per_unit: 1 },
    ] }, expect.any(String));
    expect(page.panel()).toBe('map');
  });

  it('rejects a fraction that cannot become whole eggs', async () => {
    page.openLoad();
    page.loadForm.controls.items.at(0).patchValue({ unit: 'huevo', amount: '0,5' });
    await page.addLoad();
    expect(api.load).not.toHaveBeenCalled();
    expect(page.error()).toContain('huevos enteros');
  });

  it('shows a changed conversion error without queuing a rejected load', async () => {
    api.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: {
      message: 'Los datos proporcionados no son válidos.',
      errors: { 'items.0.eggs_per_unit': ['La equivalencia cambió.'] },
    } })));
    page.openLoad();
    await page.addLoad();
    expect(page.error()).toBe('La equivalencia cambió.');
    expect(outbox.enqueue).not.toHaveBeenCalled();
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
      returned_quantity: 120, notes: 'Cierre desde modo repartidor', pin: '0007',
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
    expect(sent).toEqual(['load', 'stop']);
    expect(outbox.remove).toHaveBeenCalledWith('close');
    expect(page.delivery()?.status).toBe('active');
    expect(page.message()).toContain('PIN');
  });
});
