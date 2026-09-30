import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, isDevMode, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, checkmarkCircleOutline, locationOutline, mapOutline, moonOutline, peopleOutline, removeOutline, sunnyOutline, syncOutline, statsChartOutline, trashOutline } from 'ionicons/icons';

import { normalizedRoles, postLoginPath } from '../../core/auth/access-policy';
import { AuthStore } from '../../core/auth/auth.store';
import { LocationSample, LocationService } from '../../core/native/location.service';
import { NetworkService } from '../../core/native/network.service';
import { ThemeService } from '../../core/theme/theme.service';
import { DeliveryOutboxEntry, DeliveryOutboxService } from './delivery-outbox.service';
import { DeliveriesApi } from './deliveries.api';
import { AddDeliveryLoadInput, Delivery, DeliveryClient, DeliveryLoadItemInput, DeliveryStop, DeliveryUnit, DeliveryUnitBalanceRow, LocationInput, StartDeliveryInput, StopInput } from './delivery.models';

type LoadLineForm = FormGroup<{ unit: FormControl<string>; amount: FormControl<string> }>;
type LoadForm = FormGroup<{ items: FormArray<LoadLineForm> }>;
type DeliveryMetric = 'loaded' | 'delivered' | 'remaining';

@Component({
  selector: 'app-delivery',
  templateUrl: './delivery.page.html',
  styleUrl: './delivery.page.scss',
  imports: [
    DatePipe, IonContent, IonHeader, IonIcon, IonSpinner, IonToolbar, ReactiveFormsModule, RouterLink,
  ],
})
export class DeliveryPage implements AfterViewInit, OnDestroy {
  @ViewChild('clientSheet') set clientSheet(element: ElementRef<HTMLElement> | undefined) {
    if (element) setTimeout(() => element.nativeElement.focus());
  }

  @ViewChild('metricSheet') set metricSheet(element: ElementRef<HTMLElement> | undefined) {
    if (element) setTimeout(() => element.nativeElement.focus());
  }

  @ViewChild('pinSheet') set pinSheet(element: ElementRef<HTMLElement> | undefined) {
    if (element) setTimeout(() => element.nativeElement.focus());
  }

  @ViewChild('deliveryMap') set mapElement(element: ElementRef<HTMLDivElement> | undefined) {
    if (element) setTimeout(() => this.initializeMap(element.nativeElement));
    else {
      this.map?.remove();
      this.map = null;
      this.markers.clear();
      this.currentMarker = null;
    }
  }

  readonly auth = inject(AuthStore);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  readonly canLeaveDelivery = computed(() => normalizedRoles(this.auth.user()).size > 1);
  readonly otherViewPath = computed(() => postLoginPath(this.auth.user()));
  readonly driverInitials = computed(() => (this.auth.user()?.name ?? 'R').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''));
  private readonly api = inject(DeliveriesApi);
  private readonly outbox = inject(DeliveryOutboxService);
  private readonly location = inject(LocationService);
  private readonly network = inject(NetworkService);
  readonly clients = signal<readonly DeliveryClient[]>([]);
  readonly units = signal<readonly DeliveryUnit[]>([]);
  readonly defaultUnitId = computed(() => this.units().find((unit) => unit.id === 'huevo')?.id ?? this.units()[0]?.id ?? '');
  readonly delivery = signal<Delivery | null>(null);
  readonly pendingCount = signal(0);
  readonly busy = signal(false);
  readonly syncing = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly online = this.network.online;
  readonly native = Capacitor.isNativePlatform();
  readonly canOperate = this.native || isDevMode();
  readonly profileOpen = signal(false);
  readonly panel = signal<'clients' | 'map' | 'summary'>('map');
  readonly selectedMetric = signal<DeliveryMetric | null>(null);
  readonly metricTitle = computed(() => ({ loaded: 'Huevos totales', delivered: 'Entregados', remaining: 'En vehículo' })[this.selectedMetric() ?? 'loaded']);
  readonly metricEggs = computed(() => {
    const delivery = this.delivery();
    switch (this.selectedMetric()) {
      case 'loaded': return delivery?.loaded_quantity ?? 0;
      case 'delivered': return delivery?.delivered_quantity ?? 0;
      case 'remaining': return delivery?.remaining_quantity ?? 0;
      default: return 0;
    }
  });
  readonly search = signal('');
  readonly visibleClients = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('es-UY');
    return this.clients().filter((client) => !query || `${client.name} ${client.address}`.toLocaleLowerCase('es-UY').includes(query)).slice(0, 50);
  });
  readonly selectedClient = signal<DeliveryClient | null>(null);
  readonly loadOpen = signal(false);
  readonly stopMode = signal<'delivered' | 'not_delivered'>('delivered');
  readonly stopSelections = signal<Record<string, number>>({});
  readonly selectedStopEggs = computed(() => (this.delivery()?.unit_balances?.rows ?? []).reduce((total, row) =>
    total + Math.round((this.stopSelections()[this.balanceKey(row)] ?? 0) * 1000) * row.eggs_per_unit / 1000, 0));
  readonly closeConfirmation = signal(false);
  readonly startConfirmation = signal(false);
  readonly closePending = signal(false);
  readonly startPin = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[0-9]{4}$/)] });
  readonly closePin = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[0-9]{4}$/)] });
  readonly lastPosition = signal<LocationInput | null>(null);
  readonly startForm = new FormGroup({
    items: new FormArray<LoadLineForm>([this.loadLine('120')]),
  });
  readonly loadForm = new FormGroup({
    items: new FormArray<LoadLineForm>([this.loadLine('1')]),
  });
  readonly stopForm = new FormGroup({
    reason: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  private map: L.Map | null = null;
  private readonly markers = new Map<string, L.CircleMarker>();
  private currentMarker: L.CircleMarker | null = null;
  private locationWatch: string | number | null = null;
  private locationBatch: LocationInput[] = [];
  private lastLocationFlush = 0;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private clientSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private clientSearchRequest = 0;
  private readonly unitAmountFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 3 });

  constructor() {
    addIcons({ addOutline, checkmarkCircleOutline, locationOutline, mapOutline, moonOutline, peopleOutline, removeOutline, sunnyOutline, syncOutline, statsChartOutline, trashOutline });
    this.reconnectTimer = setInterval(() => {
      if (this.online() && this.delivery()) void this.flushOutbox();
    }, 15_000);
  }

  async ngAfterViewInit(): Promise<void> {
    await Promise.all([this.refreshUnits(), this.refreshClients()]);
    await this.refreshActiveDelivery();
  }

  ngOnDestroy(): void {
    if (this.locationWatch !== null) void this.location.clearWatch(this.locationWatch);
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    if (this.clientSearchTimer) clearTimeout(this.clientSearchTimer);
    this.map?.remove();
  }

  openStartConfirmation(): void {
    if (!this.canOperate || this.busy() || !this.units().length) return;
    if (!this.loadPayload(this.startForm)) return;
    if (!this.online()) {
      this.error.set('Necesitás conexión para iniciar un reparto.');
      return;
    }
    this.clearFeedback();
    this.startPin.reset();
    this.startConfirmation.set(true);
  }

  async startDelivery(): Promise<void> {
    if (!this.canOperate) return;
    if (this.busy()) return;
    if (this.startPin.invalid) {
      this.startPin.markAsTouched();
      this.error.set('Ingresá tu PIN de 4 dígitos para iniciar el reparto.');
      return;
    }
    const payload = this.loadPayload(this.startForm);
    if (!payload) return;
    if (!this.online()) {
      this.error.set('Necesitas conexión para iniciar un reparto. Luego podrás continuar sin señal.');
      return;
    }

    this.busy.set(true);
    this.clearFeedback();
    try {
      // TODO(M16): permitir seleccionar el vehículo cuando exista el catálogo de flota.
      const response = await firstValueFrom(this.api.start({ ...payload, pin: this.startPin.value }, this.newId()));
      this.delivery.set(response.data);
      this.startConfirmation.set(false);
      this.panel.set('map');
      this.message.set('Reparto iniciado. Puedes comenzar a visitar los clientes.');
      await this.refreshQueue();
      if (this.native) await this.startTracking();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudo iniciar el reparto.'));
    } finally {
      this.startPin.reset();
      this.busy.set(false);
    }
  }

  openClient(client: DeliveryClient): void {
    if (!this.canOperate || this.statusFor(client) !== 'pending' || this.closePending()) return;
    this.clearFeedback();
    this.selectedClient.set(client);
    this.stopMode.set('delivered');
    this.stopSelections.set({});
    this.stopForm.reset({ reason: '', notes: '' });
  }

  balanceKey(row: Pick<DeliveryUnitBalanceRow, 'unit' | 'eggs_per_unit'>): string {
    return `${row.unit}|${row.eggs_per_unit}`;
  }

  selectedUnitAmount(row: DeliveryUnitBalanceRow): number {
    return this.stopSelections()[this.balanceKey(row)] ?? 0;
  }

  displayUnitAmount(amount: string | number): string {
    return this.unitAmountFormatter.format(Number(amount));
  }

  canIncrementStopUnit(row: DeliveryUnitBalanceRow): boolean {
    if (row.remaining_amount === null) return false;
    const current = this.selectedUnitAmount(row);
    const next = Math.min(Number(row.remaining_amount), current + 1);
    return next > current && this.selectedStopEggs() + (next - current) * row.eggs_per_unit <= (this.delivery()?.remaining_quantity ?? 0);
  }

  adjustStopUnit(row: DeliveryUnitBalanceRow, direction: -1 | 1): void {
    if (direction === 1 && !this.canIncrementStopUnit(row)) return;
    const current = this.selectedUnitAmount(row);
    const available = Number(row.remaining_amount ?? 0);
    const next = direction === 1 ? Math.min(available, current + 1) : Math.max(0, current - 1);
    this.stopSelections.update((selections) => ({ ...selections, [this.balanceKey(row)]: Math.round(next * 1000) / 1000 }));
  }

  private selectedStopItems(): DeliveryLoadItemInput[] {
    return (this.delivery()?.unit_balances?.rows ?? []).flatMap((row) => {
      const amount = this.selectedUnitAmount(row);
      return amount > 0 ? [{ unit: row.unit, eggs_per_unit: row.eggs_per_unit, amount: String(amount) }] : [];
    });
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.clientSearchRequest++;
    this.updateMapMarkers();
    this.fitMapToClients();
    if (this.clientSearchTimer) clearTimeout(this.clientSearchTimer);
    this.clientSearchTimer = setTimeout(() => void this.refreshClients(this.search()), 400);
  }

  selectPanel(panel: 'clients' | 'map' | 'summary'): void {
    this.selectedMetric.set(null);
    this.panel.set(panel);
  }

  openLoad(): void {
    if (!this.canOperate || this.closePending()) return;
    this.clearFeedback();
    this.loadForm.controls.items.clear();
    this.loadForm.controls.items.push(this.loadLine('1', this.defaultUnitId()));
    this.loadOpen.set(true);
  }

  async addLoad(): Promise<void> {
    const delivery = this.delivery();
    if (!this.canOperate || !delivery || this.busy() || this.closePending()) return;
    const payload = this.loadPayload(this.loadForm);
    if (!payload) return;
    const quantity = this.loadEggs(payload);

    // TODO(Notas3/M13): integrar tipo comercial y fechas de recolección al catálogo real.
    const idempotencyKey = this.newId();
    this.busy.set(true);
    this.clearFeedback();
    try {
      if (!this.online()) throw new HttpErrorResponse({ status: 0 });
      const response = await firstValueFrom(this.api.load(delivery.id, payload, idempotencyKey));
      this.delivery.set(response.data);
      this.loadOpen.set(false);
      this.message.set(`Se agregaron ${quantity} huevos al reparto.`);
    } catch (error) {
      if (this.isNetworkFailure(error)) {
        await this.outbox.enqueue({ kind: 'load', deliveryId: delivery.id, payload, idempotencyKey });
        this.updateLocalLoad(quantity, idempotencyKey, payload.items);
        this.loadOpen.set(false);
        await this.refreshQueue();
        this.message.set('Carga guardada en este dispositivo. Se enviará cuando vuelva la conexión.');
      } else this.error.set(this.errorMessage(error, 'No se pudo agregar la carga.'));
    } finally {
      this.busy.set(false);
    }
  }

  toggleProfile(): void {
    this.profileOpen.update((open) => !open);
  }

  async logout(): Promise<void> {
    await this.stopTracking();
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }

  async saveStop(): Promise<void> {
    const delivery = this.delivery();
    const client = this.selectedClient();
    if (!this.canOperate || !delivery || !client || this.busy() || this.closePending() || this.statusFor(client) !== 'pending') return;

    const delivered = this.stopMode() === 'delivered';
    const items = delivered ? this.selectedStopItems() : [];
    const quantity = delivered ? this.selectedStopEggs() : 0;
    const reason = this.stopForm.controls.reason.value.trim();
    if (delivered && (items.length === 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > delivery.remaining_quantity)) {
      this.error.set('Elegí al menos una presentación disponible para entregar.');
      return;
    }
    if (!delivered && !reason) {
      this.error.set('Indicá por qué no se pudo entregar.');
      return;
    }

    // TODO(M14/M15): agregar cobro y cuenta corriente al contratar su API; nunca simular importes.
    const payload: StopInput = {
      client_reference: client.id,
      status: this.stopMode(),
      ...(delivered ? { items } : {}),
      visit_reason: delivered ? 'Entrega realizada' : reason,
      notes: this.stopForm.controls.notes.value.trim() || undefined,
    };

    const idempotencyKey = this.newId();
    this.busy.set(true);
    this.clearFeedback();
    try {
      if (!this.online()) throw new HttpErrorResponse({ status: 0 });
      await firstValueFrom(this.api.stop(delivery.id, payload, idempotencyKey));
      this.selectedClient.set(null);
      this.updateLocalStop(client, payload, quantity);
      await this.refreshActiveDelivery();
      this.message.set(`${delivered ? 'Entrega' : 'Visita'} registrada en ${client.name}.`);
    } catch (error) {
      if (this.isNetworkFailure(error)) {
        await this.outbox.enqueue({ kind: 'stop', deliveryId: delivery.id, payload, idempotencyKey });
        this.selectedClient.set(null);
        this.updateLocalStop(client, payload, quantity);
        await this.refreshQueue();
        this.message.set('Visita guardada en este dispositivo. Se enviará cuando vuelva la conexión.');
      } else this.error.set(this.errorMessage(error, 'No se pudo registrar la visita.'));
    } finally {
      this.busy.set(false);
    }
  }

  async closeDelivery(): Promise<void> {
    const delivery = this.delivery();
    if (!this.canOperate || !delivery || this.busy() || this.closePending()) return;
    if (this.closePin.invalid) {
      this.closePin.markAsTouched();
      this.error.set('Ingresá tu PIN de 4 dígitos para cerrar el reparto.');
      return;
    }
    if (!this.online()) {
      this.error.set('Necesitás conexión para verificar el PIN y cerrar el reparto. Tus cambios pendientes siguen guardados.');
      this.closePin.reset();
      return;
    }

    const returnedQuantity = Math.max(0, delivery.remaining_quantity);
    const payload = { returned_quantity: returnedQuantity, notes: 'Cierre desde modo repartidor', pin: this.closePin.value };
    const idempotencyKey = this.newId();
    this.busy.set(true);
    this.clearFeedback();
    try {
      if (this.pendingCount() > 0) {
        await this.flushOutbox();
        if (this.pendingCount() > 0) {
          this.error.set('Hay cambios pendientes que no se pudieron enviar. Sincronizalos antes de finalizar.');
          return;
        }
      }
      await this.stopTracking();
      if (!this.online()) throw new HttpErrorResponse({ status: 0 });
      const response = await firstValueFrom(this.api.close(delivery.id, payload, idempotencyKey));
      this.delivery.set(response.data);
      this.closeConfirmation.set(false);
      this.message.set('Reparto cerrado correctamente.');
      await this.refreshQueue();
    } catch (error) {
      this.error.set(this.isNetworkFailure(error)
        ? 'No se pudo verificar el PIN sin conexión. Reintentá el cierre cuando vuelva la señal.'
        : this.errorMessage(error, 'No se pudo cerrar el reparto.'));
      if (this.native) await this.startTracking();
    } finally {
      this.closePin.reset();
      this.busy.set(false);
    }
  }

  async syncNow(): Promise<void> {
    if (!this.canOperate || !this.online() || !this.delivery()) return;
    await this.flushOutbox();
    await this.refreshActiveDelivery();
  }

  readonly completedStops = computed(() => this.delivery()?.stops?.filter((stop) => stop.status !== 'pending').length ?? 0);
  readonly loadedPresentations = computed(() => {
    const totals: Record<string, number> = {};
    for (const load of this.delivery()?.loads ?? []) {
      for (const item of load.items ?? []) {
        totals[item.category] = (totals[item.category] ?? 0) + Math.round(Number(item.amount) * 1000);
      }
    }
    return {
      maples: (totals['maples'] ?? 0) / 1000,
      cajones: (totals['cajones'] ?? 0) / 1000,
      cajas: (totals['cajas'] ?? 0) / 1000,
    };
  });

  statusFor(client: DeliveryClient): DeliveryStop['status'] {
    return this.delivery()?.stops?.find((stop) => stop.client_reference === client.id)?.status ?? 'pending';
  }

  private async startTracking(): Promise<void> {
    if (this.locationWatch !== null) return;
    try {
      await this.location.requestPermission();
      this.locationWatch = await this.location.watch(
        (sample) => void this.captureLocation(sample),
        () => this.error.set('No se pudo obtener el GPS. Puedes continuar y sincronizar más tarde.'),
      );
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudo activar el GPS.'));
    }
  }

  private async stopTracking(): Promise<void> {
    if (this.locationWatch !== null) {
      await this.location.clearWatch(this.locationWatch);
      this.locationWatch = null;
    }
    await this.flushLocationBatch();
  }

  private async captureLocation(sample: LocationSample): Promise<void> {
    const delivery = this.delivery();
    if (!delivery) return;
    const location: LocationInput = {
      client_event_id: this.newId(),
      latitude: sample.latitude,
      longitude: sample.longitude,
      accuracy: sample.accuracy,
      speed: sample.speed,
      captured_at: sample.capturedAt,
    };
    this.locationBatch.push(location);
    this.lastPosition.set(location);
    this.updateCurrentMarker(location);
    const elapsed = Date.now() - this.lastLocationFlush;
    if (this.locationBatch.length >= 10 || elapsed >= 60_000) await this.flushLocationBatch();
  }

  private async flushLocationBatch(): Promise<void> {
    const delivery = this.delivery();
    if (!delivery || this.locationBatch.length === 0) return;
    const locations = this.locationBatch.splice(0);
    this.lastLocationFlush = Date.now();
    if (!this.online()) {
      await this.enqueueLocations(delivery.id, locations);
      return;
    }
    try {
      await firstValueFrom(this.api.locations(delivery.id, locations));
    } catch {
      await this.enqueueLocations(delivery.id, locations);
    }
    await this.refreshQueue();
  }

  private async enqueueLocations(deliveryId: string, locations: LocationInput[]): Promise<void> {
    await this.outbox.enqueue({ kind: 'locations', deliveryId, payload: { locations }, idempotencyKey: null });
  }

  private async flushOutbox(): Promise<void> {
    const delivery = this.delivery();
    if (!this.canOperate || !delivery || !this.online() || this.syncing()) return;
    this.syncing.set(true);
    let replayedBusiness = false;
    try {
      const entries = (await this.outbox.list(delivery.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const entry of entries) {
        try {
          if (entry.kind === 'close') {
            // Cierres previos a la confirmación por PIN no pueden reproducirse sin exponer una credencial.
            await this.outbox.remove(entry.id);
            this.closePending.set(false);
            this.message.set('Para finalizar el reparto, confirmá el cierre con tu PIN.');
            continue;
          }
          await this.sendOutboxEntry(entry);
          await this.outbox.remove(entry.id);
          if (entry.kind === 'load' || entry.kind === 'stop') replayedBusiness = true;
        } catch (error) {
          this.error.set(this.errorMessage(error, 'No se pudo sincronizar una operación. Revisá los cambios pendientes.'));
          break;
        }
      }
    } finally {
      this.syncing.set(false);
      await this.refreshQueue();
    }
    if (replayedBusiness) await this.refreshActiveDelivery();
  }

  private async sendOutboxEntry(entry: DeliveryOutboxEntry): Promise<Delivery | void> {
    if (entry.kind === 'locations') {
      await firstValueFrom(this.api.locations(entry.deliveryId, (entry.payload as { locations: LocationInput[] }).locations));
      return;
    }
    if (!entry.idempotencyKey) throw new Error('La cola no tiene una clave de idempotencia.');
    if (entry.kind === 'load') {
      return (await firstValueFrom(this.api.load(entry.deliveryId, entry.payload as AddDeliveryLoadInput, entry.idempotencyKey))).data;
    }
    if (entry.kind === 'stop') {
      await firstValueFrom(this.api.stop(entry.deliveryId, entry.payload as StopInput, entry.idempotencyKey));
      return;
    }
    throw new Error('El cierre requiere confirmar el PIN en línea.');
  }

  private async refreshActiveDelivery(): Promise<void> {
    if (!this.online()) return;
    try {
      const response = await firstValueFrom(this.api.current());
      const active = response.data[0] ?? null;
      if (active) {
        const detail = (await firstValueFrom(this.api.detail(active.id))).data;
        const queued = await this.outbox.list(detail.id);
        this.delivery.set(detail);
        // Reaplicar operaciones todavía no confirmadas sin asignar clientes al recorrido.
        for (const entry of queued.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
          if (entry.kind === 'load' && entry.idempotencyKey
            && !detail.loads?.some((load) => load.idempotency_key === entry.idempotencyKey)) {
            const payload = entry.payload as AddDeliveryLoadInput;
            this.updateLocalLoad(this.loadEggs(payload), entry.idempotencyKey, payload.items);
          }
          if (entry.kind === 'stop') {
            const payload = entry.payload as StopInput;
            const client = this.clients().find((item) => item.id === payload.client_reference);
            if (client && this.statusFor(client) === 'pending') this.updateLocalStop(client, payload, this.stopEggs(payload));
          }
        }
        this.closePending.set(false);
        if (this.native && !this.closePending()) await this.startTracking();
      }
      else if (this.delivery()?.status === 'active') this.delivery.set(null);
      await this.refreshQueue();
    } catch (error) {
      if (!this.delivery()) this.error.set(this.errorMessage(error, 'No se pudo consultar el reparto actual.'));
    }
  }

  private async refreshQueue(): Promise<void> {
    const delivery = this.delivery();
    this.pendingCount.set(delivery ? await this.outbox.count(delivery.id) : 0);
  }

  private async refreshClients(search = ''): Promise<void> {
    if (!this.online()) return;
    const request = ++this.clientSearchRequest;
    try {
      const response = await firstValueFrom(this.api.clients(search));
      if (request !== this.clientSearchRequest) return;
      this.clients.set(response.data);
      this.updateMapMarkers();
      this.fitMapToClients();
    } catch (error) {
      if (request === this.clientSearchRequest) this.error.set(this.errorMessage(error, 'No se pudo cargar la lista de clientes.'));
    }
  }

  private async refreshUnits(): Promise<void> {
    if (!this.online()) return;
    try {
      const response = await firstValueFrom(this.api.units());
      this.units.set(response.data);
      const first = this.defaultUnitId();
      if (!this.startForm.controls.items.at(0).controls.unit.value) this.startForm.controls.items.at(0).controls.unit.setValue(first);
      if (!this.loadForm.controls.items.at(0).controls.unit.value) this.loadForm.controls.items.at(0).controls.unit.setValue(first);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudieron cargar las unidades de huevos.'));
    }
  }

  private loadLine(amount: string, unit = ''): LoadLineForm {
    return new FormGroup({
      unit: new FormControl(unit, { nonNullable: true, validators: [Validators.required] }),
      amount: new FormControl(amount, { nonNullable: true, validators: [Validators.required] }),
    });
  }

  addLine(form: LoadForm): void {
    if (form.controls.items.length < 20) form.controls.items.push(this.loadLine('1', this.defaultUnitId()));
  }

  removeLine(form: LoadForm, index: number): void {
    if (form.controls.items.length > 1) form.controls.items.removeAt(index);
  }

  private itemEggs(item: DeliveryLoadItemInput): number {
    const amount = item.amount.replace(',', '.').trim();
    if (!/^\d{1,10}(?:\.\d{1,3})?$/.test(amount)) return 0;
    const [whole, fraction = ''] = amount.split('.');
    const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
    const eggsScaled = thousandths * item.eggs_per_unit;
    return thousandths > 0 && eggsScaled % 1000 === 0 ? eggsScaled / 1000 : 0;
  }

  readonly lineEggs = (unitId: string, amount: string): number => {
    const unit = this.units().find((item) => item.id === unitId);
    return unit ? this.itemEggs({ unit: unitId, amount, eggs_per_unit: unit.eggs_per_unit }) : 0;
  };

  readonly formEggs = (form: LoadForm): number => form.controls.items.controls.reduce(
    (sum, line) => sum + this.lineEggs(line.controls.unit.value, line.controls.amount.value), 0,
  );

  private loadPayload(form: LoadForm): { items: DeliveryLoadItemInput[] } | null {
    const items = form.controls.items.controls.map((line) => {
      const unit = this.units().find((entry) => entry.id === line.controls.unit.value);
      return unit ? { unit: unit.id, amount: line.controls.amount.value.replace(',', '.').trim(), eggs_per_unit: unit.eggs_per_unit } : null;
    });
    const total = items.reduce((sum, item) => sum + (item ? this.itemEggs(item) : 0), 0);
    if (form.invalid || items.some((item) => !item || this.itemEggs(item) < 1) || total < 1 || total > 2147483647) {
      form.markAllAsTouched();
      this.error.set('Revisá las unidades y cantidades: cada línea debe equivaler a huevos enteros.');
      return null;
    }

    return { items: items as DeliveryLoadItemInput[] };
  }

  private loadEggs(payload: AddDeliveryLoadInput | StartDeliveryInput): number {
    return payload.items?.reduce((sum, item) => sum + this.itemEggs(item), 0) ?? payload.quantity ?? 0;
  }

  unitLabel(unitId: string): string {
    return this.units().find((unit) => unit.id === unitId)?.label ?? unitId;
  }

  metricUnitAmount(row: DeliveryUnitBalanceRow): string {
    const amount = this.selectedMetric() === 'loaded' ? row.loaded_amount
      : this.selectedMetric() === 'delivered' ? row.delivered_amount : row.remaining_amount;
    return amount === null ? '—' : this.displayUnitAmount(amount);
  }

  private initializeMap(element: HTMLDivElement): void {
    if (this.map || !element.isConnected) return;
    const center: L.LatLngExpression = [-34.73, -56.218];
    this.map = L.map(element, { zoomControl: false, attributionControl: true }).setView(center, 13);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(this.map);
    this.updateMapMarkers();
    this.fitMapToClients();
    const position = this.lastPosition() ?? this.delivery()?.latest_location;
    if (position) this.updateCurrentMarker(position);
    setTimeout(() => { this.map?.invalidateSize(); this.fitMapToClients(); }, 100);
  }

  private fitMapToClients(): void {
    if (!this.map) return;
    const points = this.visibleClients().map((client) => [client.latitude, client.longitude] as L.LatLngTuple);
    if (!points.length) return;
    const element = this.map.getContainer();
    const controlsBottom = element.closest('ion-content')?.querySelector('.map-search')?.getBoundingClientRect().bottom ?? 0;
    const topPadding = Math.min(Math.max(32, controlsBottom - element.getBoundingClientRect().top + 16), Math.max(32, element.clientHeight - 80));
    this.map.fitBounds(points, { paddingTopLeft: [24, topPadding], paddingBottomRight: [24, 24], maxZoom: 15 });
  }

  private updateMapMarkers(): void {
    if (!this.map) return;
    const visible = new Set(this.visibleClients().map((client) => client.id));
    for (const [id, marker] of this.markers) {
      if (!visible.has(id)) { marker.remove(); this.markers.delete(id); }
    }
    for (const client of this.visibleClients()) {
      const visited = this.statusFor(client) !== 'pending';
      const existing = this.markers.get(client.id);
      if (existing) { existing.setStyle({ fillColor: visited ? '#176b45' : '#173d62' }); continue; }
      const marker = L.circleMarker([client.latitude, client.longitude], {
        radius: 11, color: '#fff', weight: 3, fillColor: visited ? '#176b45' : '#173d62', fillOpacity: 1,
      }).addTo(this.map).bindTooltip(client.name);
      marker.on('click', () => this.openClient(client));
      this.markers.set(client.id, marker);
    }
  }

  private updateCurrentMarker(location: { latitude: number | string; longitude: number | string }): void {
    if (!this.map) return;
    this.currentMarker?.remove();
    this.currentMarker = L.circleMarker([Number(location.latitude), Number(location.longitude)], { radius: 8, color: '#146c63', fillColor: '#4ec5a4', fillOpacity: 0.9 }).addTo(this.map);
  }

  private stopEggs(payload: StopInput): number {
    return payload.items?.reduce((total, item) => total + this.itemEggs(item), 0) ?? 0;
  }

  private updateLocalStop(client: DeliveryClient, payload: StopInput, quantity: number): void {
    this.delivery.update((delivery) => delivery ? {
      ...delivery,
      stops: [...(delivery.stops ?? []).filter((stop) => stop.client_reference !== client.id), {
        id: -1, client_reference: client.id, client_name: client.name, address: client.address,
        latitude: client.latitude, longitude: client.longitude, sequence: 0, status: payload.status,
        items: payload.items?.map((item) => ({ ...item, label: delivery.unit_balances?.rows.find((row) =>
          row.unit === item.unit && row.eggs_per_unit === item.eggs_per_unit)?.label ?? this.unitLabel(item.unit), eggs: this.itemEggs(item) })) ?? [],
        delivered_quantity: quantity, visit_reason: null, notes: null, visited_at: new Date().toISOString(),
      }],
      delivered_quantity: delivery.delivered_quantity + quantity,
      remaining_quantity: Math.max(0, delivery.remaining_quantity - quantity),
      unit_balances: delivery.unit_balances && {
        ...delivery.unit_balances,
        rows: delivery.unit_balances.rows.map((row) => {
          const used = (payload.items ?? []).filter((item) => this.balanceKey(item) === this.balanceKey(row))
            .reduce((sum, item) => sum + Number(item.amount), 0);
          return {
            ...row,
            delivered_amount: String(Math.round((Number(row.delivered_amount) + used) * 1000) / 1000),
            delivered_eggs: row.delivered_eggs + Math.round(used * row.eggs_per_unit),
            remaining_amount: row.remaining_amount === null ? null
              : String(Math.round((Number(row.remaining_amount) - used) * 1000) / 1000),
          };
        }),
      },
    } : delivery);
    this.updateMapMarkers();
  }

  private updateLocalLoad(quantity: number, idempotencyKey: string, items?: DeliveryLoadItemInput[]): void {
    const loadedItems = items ?? [{ unit: 'huevo', amount: String(quantity), eggs_per_unit: 1 }];
    this.delivery.update((delivery) => {
      if (!delivery) return delivery;
      const rows = [...(delivery.unit_balances?.rows ?? [])];
      for (const item of loadedItems) {
        const index = rows.findIndex((row) => this.balanceKey(row) === this.balanceKey(item));
        const amount = Number(item.amount);
        const eggs = this.itemEggs(item);
        if (index >= 0) {
          const row = rows[index];
          rows[index] = {
            ...row, loaded_amount: String(Math.round((Number(row.loaded_amount) + amount) * 1000) / 1000),
            loaded_eggs: row.loaded_eggs + eggs,
            remaining_amount: row.remaining_amount === null ? null
              : String(Math.round((Number(row.remaining_amount) + amount) * 1000) / 1000),
          };
        } else rows.push({
          unit: item.unit, label: this.unitLabel(item.unit), eggs_per_unit: item.eggs_per_unit,
          loaded_amount: item.amount, delivered_amount: '0', remaining_amount: item.amount,
          loaded_eggs: eggs, delivered_eggs: 0,
        });
      }
      return {
      ...delivery,
      loaded_quantity: delivery.loaded_quantity + quantity,
      remaining_quantity: delivery.remaining_quantity + quantity,
      loads: [...(delivery.loads ?? []), {
        id: -Date.now(), idempotency_key: idempotencyKey, quantity, type: 'additional',
        items: loadedItems.map((item) => ({ ...item, label: this.unitLabel(item.unit),
          category: this.units().find((unit) => unit.id === item.unit)?.category ?? '', eggs: this.itemEggs(item) })),
        created_at: new Date().toISOString(),
      }],
      unit_balances: delivery.unit_balances ? { ...delivery.unit_balances, rows } : undefined,
    };
    });
  }

  private isNetworkFailure(error: unknown): boolean {
    return !this.online() || error instanceof HttpErrorResponse && error.status === 0;
  }

  private clearFeedback(): void {
    this.message.set(null);
    this.error.set(null);
  }

  private errorMessage(error: unknown, fallback: string): string {
    const body = (error as { error?: { message?: string; errors?: Record<string, string[]> } })?.error;
    return Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? fallback;
  }

  private newId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
