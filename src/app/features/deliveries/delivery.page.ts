import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, Injector, OnDestroy, ViewChild, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { DialogFocusDirective } from '../../shared/ui/dialog-focus.directive';
import { toSignal } from '@angular/core/rxjs-interop';
import { parseUyuAmount, uyuDecimal } from '../../shared/utils/uyu-money';
import { DeliveryClientRowComponent } from './components/delivery-client-row.component';
import { DeliveryPendingOperationsComponent } from './components/delivery-pending-operations.component';
import { DeliveryFinancialSummaryComponent } from './components/delivery-financial-summary.component';
import { DeliveryStartOptionsComponent } from './components/delivery-start-options.component';
import { DeliveryVehicleFuelFormComponent } from './components/delivery-vehicle-fuel-form.component';
import { DeliveryStopEditorComponent } from './components/delivery-stop-editor.component';
import { DeliverySummaryComponent } from './components/delivery-summary.component';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import mapboxgl from 'mapbox-gl/esm';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import {
  IonContent,
  IonHeader,
  IonIcon,
  Platform,
  IonSpinner,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, checkmarkCircleOutline, contractOutline, expandOutline, locateOutline, locationOutline, mapOutline, moonOutline, peopleOutline, removeOutline, sunnyOutline, syncOutline, statsChartOutline, trashOutline, wifiOutline } from 'ionicons/icons';

import { postLoginPath } from '../../core/auth/access-policy';
import { AuthStore } from '../../core/auth/auth.store';
import { hasAnyPermission } from '../../core/auth/permission-keys';
import { MAPBOX_ACCESS_TOKEN, mapboxWorkerUrl } from '../../core/config/mapbox.config';
import { LocationService } from '../../core/native/location.service';
import { NetworkService } from '../../core/native/network.service';
import { ServerHealthService } from '../../core/api/server-health.service';
import { ThemeService } from '../../core/theme/theme.service';
import { DeliveryOutboxEntry, DeliveryOutboxService } from './delivery-outbox.service';
import { DeliveriesApi } from './deliveries.api';
import { NotificationBellComponent } from '../notifications/components/notification-bell.component';
import { VehiclesApi } from '../vehicles/services/vehicles.api';
import { VehicleFuelInput, VehicleOption } from '../vehicles/interfaces/vehicle';
import { formatFuelLiters } from '../vehicles/vehicle-format';
import { DeliveryUnitRowComponent } from './components/delivery-unit-row.component';
import { createDeliveryId } from './delivery-id';
import { formatDeliveryMoney } from './delivery-money';
import { AddDeliveryLoadInput, Delivery, DeliveryClient, DeliveryLoadItemInput, DeliveryStop, DeliveryUnit, DeliveryUnitBalanceRow, DeliveryProductionUnit, DeliveryStopItemInput, CloseDeliveryInput, DeliveryPaymentInput, DeliveryPaymentMethod, LocationInput, StartDeliveryInput, StopInput } from './delivery.models';
import type { DeliveryStartMode, LoadForm, LoadLineForm } from './types/delivery-load-form.type';

type DeliveryMetric = 'loaded' | 'delivered' | 'remaining';

@Component({
  selector: 'app-delivery',
  templateUrl: './delivery.page.html',
  styleUrls: ['./delivery.page.scss', './delivery-map.scss'],
  imports: [
    DialogFocusDirective, DeliveryClientRowComponent, DeliveryPendingOperationsComponent, DeliveryFinancialSummaryComponent, DeliveryStartOptionsComponent, DeliveryStopEditorComponent, DeliverySummaryComponent, DeliveryVehicleFuelFormComponent, DeliveryUnitRowComponent, DatePipe, IonContent, IonHeader, IonIcon, IonSpinner, IonToolbar, NotificationBellComponent, ReactiveFormsModule, RouterLink,
  ],
})
export class DeliveryPage implements AfterViewInit, OnDestroy {
  @ViewChild(IonContent) private content?: IonContent;
  @ViewChild('mapModeToggle') private mapModeToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild(DeliveryStopEditorComponent) private stopEditor?: DeliveryStopEditorComponent;

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
    else this.removeMap();
  }

  readonly auth = inject(AuthStore);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly mapAccessToken = inject(MAPBOX_ACCESS_TOKEN, { optional: true })?.trim();
  readonly otherViewPath = computed(() => postLoginPath(this.auth.user()));
  readonly canLeaveDelivery = computed(() => this.otherViewPath() === '/administracion');
  readonly driverInitials = computed(() => (this.auth.user()?.name ?? 'R').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''));
  private readonly api = inject(DeliveriesApi);
  private readonly platform = inject(Platform);
  private readonly vehiclesApi = inject(VehiclesApi);
  private readonly outbox = inject(DeliveryOutboxService);
  private readonly location = inject(LocationService);
  private readonly network = inject(NetworkService);
  private readonly serverHealth = inject(ServerHealthService);
  readonly clients = signal<readonly DeliveryClient[]>([]);
  readonly units = signal<readonly DeliveryUnit[]>([]);
  readonly productionUnits = signal<readonly DeliveryProductionUnit[]>([]);
  readonly money = formatDeliveryMoney;
  readonly fuelLiters = formatFuelLiters;
  readonly defaultUnitId = computed(() => this.units().find((unit) => unit.id === 'huevo')?.id ?? this.units()[0]?.id ?? '');
  private readonly defaultStartUnitId = computed(() => this.units().find((unit) => unit.id === 'maple')?.id ?? this.defaultUnitId());
  readonly delivery = signal<Delivery | null>(null);
  readonly pendingCount = signal(0);
  readonly busy = signal(false);
  readonly syncing = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly online = this.network.online;
  readonly serverStatus = this.serverHealth.state.asReadonly();
  readonly serverStatusLabel = computed(() => this.serverStatus() === 'online' ? 'Conectado al servidor'
    : this.serverStatus() === 'offline' ? 'Sin conexión con el servidor' : 'Comprobando conexión con el servidor');
  readonly canStartDelivery = computed(() => hasAnyPermission(this.auth.user()?.permissions, 'can_start_deliveries'));
  readonly canUpdateDelivery = computed(() => hasAnyPermission(this.auth.user()?.permissions, 'can_update_own_deliveries'));
  readonly canManageFuel = computed(() => this.auth.user()?.roles.includes('admin') === true || this.auth.user()?.permissions?.some((permission) => ['vehicles.fuel.manage', 'delivery.fuel.record'].includes(permission)) === true);
  readonly profileOpen = signal(false);
  readonly panel = signal<'clients' | 'map' | 'summary'>('clients');
  readonly dialogOpen = computed(() => !!this.selectedClient() || this.loadOpen() || this.startConfirmation() || this.closeConfirmation() || !!this.selectedMetric() || !!this.editingStop());
  readonly editingStopId = signal<number | null>(null);
  readonly editingStop = computed(() => this.delivery()?.stops?.find((stop) => stop.id === this.editingStopId()) ?? null);
  readonly canEditRegisteredStops = computed(() => {
    const delivery = this.delivery();
    const actor = this.auth.user();
    return this.canUpdateDelivery() && this.online() && !this.busy() && !this.syncing() && !this.closePending()
      && delivery?.status === 'active' && !!actor && delivery.driver?.id === actor.id;
  });
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
  readonly cachedClients = signal<readonly DeliveryClient[]>([]);
  readonly clientPage = signal(1);
  readonly clientLastPage = signal(1);
  readonly clientTotal = signal(0);
  readonly clientsLoading = signal(false);
  readonly clientStatus = signal('');
  readonly mapClients = signal<readonly DeliveryClient[]>([]);
  readonly mapHasMore = signal(false);
  readonly mapError = signal<string | null>(null);
  readonly mapReady = signal(false);
  readonly mapFocused = signal(false);
  readonly locationLoading = signal(false);
  readonly locationError = signal<string | null>(null);
  readonly mapVisitStatus = signal('');
  readonly visibleClients = computed(() => {
    if (this.online()) return this.clients();
    const query = this.search().trim().toLocaleLowerCase('es-UY');
    return this.cachedClients().filter((client) => (!query || `${client.name} ${client.address ?? ''}`.toLocaleLowerCase('es-UY').includes(query)) && (!this.clientStatus() || client.status === this.clientStatus()));
  });
  readonly pendingEntries = signal<DeliveryOutboxEntry[]>([]);
  readonly reviewing = signal<DeliveryOutboxEntry | null>(null);
  readonly reviewingLinkedPayment = computed(() => {
    const entry = this.reviewing();
    if (entry?.kind !== 'payment') return null;
    const payment = entry.payload as DeliveryPaymentInput;
    return payment.delivery_stop_id === this.editingStopId() ? payment : null;
  });
  readonly reviewEntries = computed(() => this.pendingEntries().filter((entry) => entry.state === 'needs_review'));
  readonly paymentChoice = signal<'' | 'fiado' | 'payment'>('');
  readonly previewRevision = signal(0);
  readonly incrementPreview = (value: number) => value + 1;
  readonly selectedClient = signal<DeliveryClient | null>(null);
  readonly loadOpen = signal(false);
  readonly stopMode = signal<'delivered' | 'not_delivered' | 'payment'>('delivered');
  readonly stopSelections = signal<Record<string, number>>({});
  readonly selectedStopEggs = computed(() => (this.delivery()?.unit_balances?.rows ?? []).reduce((total, row) =>
    total + Math.round((this.stopSelections()[this.balanceKey(row)] ?? 0) * 1000) * row.eggs_per_unit / 1000, 0));
  readonly closeConfirmation = signal(false);
  readonly startConfirmation = signal(false);
  readonly availableVehicles = signal<VehicleOption[]>([]);
  readonly selectedVehicleId = signal('');
  readonly selectedVehicleWarnings = computed(() => this.availableVehicles().find((vehicle) => vehicle.id === this.selectedVehicleId())?.warnings ?? []);
  readonly startOdometer = new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d)?$/)] });
  readonly closeOdometer = new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d)?$/)] });
  readonly fuelSaving = signal(false);
  readonly fuelReceipt = signal<File | null>(null);
  readonly fuelForm = new FormGroup({
    liters: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d{1,3})?$/)] }),
    fuel_type: new FormControl('Nafta', { nonNullable: true, validators: [Validators.required, Validators.maxLength(40)] }),
    amount: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d+(?:[.,]\d{1,3})?$/)] }),
    supplier: new FormControl('', { nonNullable: true }),
    odometer_km: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d+(?:[.,]\d)?$/)] }),
    notes: new FormControl('', { nonNullable: true }),
  });
  readonly checkingDelivery = signal(true);
  readonly startMode = signal<DeliveryStartMode | null>(null);
  readonly startWithoutLoad = computed(() => this.startMode() === 'empty');
  readonly vehiclesLoading = signal(false);
  readonly closePending = signal(false);
  readonly startPin = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[0-9]{4}$/)] });
  readonly closePin = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[0-9]{4}$/)] });
  readonly startForm = new FormGroup({
    production_unit_id: new FormControl<number | null>(null, Validators.required),
    items: new FormArray<LoadLineForm>([this.loadLine('')]),
  });
  private readonly startValues = toSignal(this.startForm.valueChanges, { initialValue: this.startForm.getRawValue() });
  readonly startTotal = computed(() => {
    this.startValues();
    return this.formEggs(this.startForm);
  });
  readonly loadForm = new FormGroup({
    production_unit_id: new FormControl<number | null>(null, Validators.required),
    items: new FormArray<LoadLineForm>([this.loadLine('1')]),
  });
  readonly stopForm = new FormGroup({
    reason: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    amount: new FormControl('', { nonNullable: true }),
    payment_method: new FormControl<DeliveryPaymentMethod>('cash', { nonNullable: true }),
    payment_reference: new FormControl('', { nonNullable: true }),
  });
  private readonly stopValues = toSignal(this.stopForm.valueChanges, { initialValue: this.stopForm.getRawValue() });
  readonly preview = computed(() => {
    this.previewRevision(); this.stopSelections();
    const values = this.stopValues();
    let charge = 0n;
    if (this.stopMode() === 'delivered') {
      if ((this.delivery()?.unit_balances?.rows ?? []).some((row) => this.selectedUnitAmount(row) > 0 && this.priceControl(row).invalid)) return null;
      for (const item of this.selectedStopItems()) {
        const quantity = parseUyuAmount(item.amount);
        if (quantity === null || !Number.isInteger(item.unit_price)) return null;
        charge += quantity * BigInt(item.unit_price!);
      }
    }
    const paid = this.stopMode() === 'not_delivered' || this.paymentChoice() === 'fiado' && this.stopMode() === 'delivered' ? 0n : parseUyuAmount(values.amount ?? '');
    const before = parseUyuAmount(this.selectedClient()?.account?.balance ?? '');
    return paid === null || before === null ? null : { charge: uyuDecimal(charge), paid: uyuDecimal(paid), after: uyuDecimal(before + charge - paid) };
  });

  readonly returnUnit = new FormControl<number | null>(null);
  readonly returnAmounts = new FormArray<FormControl<string>>([]);
  readonly returnRows = signal<DeliveryUnitBalanceRow[]>([]);
  readonly returnLegacy = signal(false);
  readonly returnLegacyQuantity = new FormControl('0', { nonNullable: true });
  readonly returnNotes = new FormControl('', { nonNullable: true });
  readonly returnOrigins = computed(() => {
    const delivery = this.delivery();
    const origins = new Map<number, DeliveryProductionUnit>();
    for (const load of delivery?.loads ?? []) {
      if (load.production_unit) origins.set(load.production_unit.id, load.production_unit);
    }
    if (!origins.size && delivery?.production_unit) origins.set(delivery.production_unit.id, delivery.production_unit);
    return [...origins.values()];
  });
  private closePrepared = false;
  private readonly quantityControls = new Map<string, FormControl<string>>();
  private readonly priceControls = new Map<string, FormControl<string>>();

  private map: MapboxMap | null = null;
  private readonly markers = new Map<string, MapboxMarker>();
  private currentMarker: MapboxMarker | null = null;
  private mapResizeObserver?: ResizeObserver;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private clientSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private clientSearchRequest = 0;
  private backButtonSubscription?: Subscription;
  private mapRequest = 0;
  private mapTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private readonly unitAmountFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 3 });

  constructor() {
    addIcons({ addOutline, checkmarkCircleOutline, contractOutline, expandOutline, locateOutline, locationOutline, mapOutline, moonOutline, peopleOutline, removeOutline, sunnyOutline, syncOutline, statsChartOutline, trashOutline, wifiOutline });
    let owner = this.auth.user()?.id;
    effect(() => {
      const next = this.auth.user()?.id;
      if (next !== owner) {
        owner = next;
        this.delivery.set(null); this.clients.set([]); this.cachedClients.set([]); this.mapClients.set([]);
        this.pendingEntries.set([]); this.pendingCount.set(0); this.selectedClient.set(null);
        this.editingStopId.set(null); this.reviewing.set(null);
        this.loadOpen.set(false); this.closeConfirmation.set(false); this.startConfirmation.set(false);
        this.busy.set(false); this.syncing.set(false); this.clearFeedback();
        this.resetStart();
        this.closePin.reset(); this.removeMap();
        this.availableVehicles.set([]); this.closeOdometer.reset();
      }
    });
    this.reconnectTimer = setInterval(() => {
      if (this.online() && this.delivery()) void this.flushOutbox();
    }, 15_000);
  }

  async ngAfterViewInit(): Promise<void> {
    const actorId = this.auth.user()?.id;
    if (actorId && typeof this.outbox.referencesFor === 'function') {
      try {
        const cached = await this.outbox.referencesFor(actorId);
        if (cached) {
          this.units.set(cached.units);
          this.productionUnits.set(cached.productionUnits);
          this.clients.set(cached.clients ?? []);
          this.cachedClients.set(cached.clients ?? []);
          if (cached.delivery?.status === 'active') this.delivery.set(cached.delivery);
        }
      } catch {
        this.error.set('No se pudo leer el catálogo local. Conectate para actualizarlo.');
      }
    }
    try {
      await Promise.all([this.refreshUnits(), this.refreshProductionUnits(), this.refreshClients(), this.refreshVehicles()]);
      await this.refreshActiveDelivery();
    } finally {
      this.checkingDelivery.set(false);
    }
    await this.refreshQueue();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.serverHealth.stop();
    this.backButtonSubscription?.unsubscribe();
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    if (this.clientSearchTimer) clearTimeout(this.clientSearchTimer);
    this.removeMap();
  }

  ionViewDidEnter(): void {
    this.serverHealth.start();
    this.backButtonSubscription?.unsubscribe();
    this.backButtonSubscription = this.platform.backButton.subscribeWithPriority(1000, (processNextHandler) => {
      if (this.profileOpen()) { this.profileOpen.set(false); return; }
      if (this.editingStop()) { this.closeStopEditor(); return; }
      if (this.selectedMetric()) { this.selectedMetric.set(null); return; }
      if (this.selectedClient()) { this.selectedClient.set(null); return; }
      if (this.loadOpen()) { this.loadOpen.set(false); return; }
      if (this.startConfirmation()) { this.cancelStartConfirmation(); return; }
      if (this.closeConfirmation()) { this.closeConfirmation.set(false); this.closePin.reset(); return; }
      if (this.mapFocused()) { this.setMapFocused(false); return; }
      if (this.delivery()?.status === 'active') {
        if (this.panel() !== 'clients') this.selectPanel('clients');
        return;
      }
      if (this.startMode()) { this.chooseStartMode(null); return; }
      processNextHandler();
    });
  }

  ionViewWillLeave(): void {
    this.serverHealth.stop();
    this.mapFocused.set(false);
    this.backButtonSubscription?.unsubscribe();
    this.backButtonSubscription = undefined;
  }

  chooseStartMode(mode: DeliveryStartMode | null): void {
    if (this.checkingDelivery() || this.busy() || this.delivery()?.status === 'active') return;
    this.startMode.set(mode);
    this.clearFeedback();
    if (mode === 'loaded' && !this.startForm.controls.items.at(0).controls.unit.value) {
      this.startForm.controls.items.at(0).controls.unit.setValue(this.defaultStartUnitId());
    }
    void this.content?.scrollToTop(0);
  }

  openStartConfirmation(): void {
    if (!this.canStartDelivery() || this.busy() || !this.startDetails()) return;
    this.clearFeedback();
    this.startPin.reset();
    this.startConfirmation.set(true);
  }

  cancelStartConfirmation(): void {
    if (this.busy()) return;
    this.startConfirmation.set(false);
    this.startPin.reset();
    this.error.set(null);
  }

  async startDelivery(): Promise<void> {
    if (!this.canStartDelivery() || this.busy()) return;
    if (this.startPin.invalid) {
      this.startPin.markAsTouched();
      this.error.set('Ingresá tu PIN de 4 dígitos para iniciar el reparto.');
      return;
    }
    const details = this.startDetails();
    if (!details) return;

    this.busy.set(true);
    this.clearFeedback();
    try {
      const response = await firstValueFrom(this.api.start({ ...details, pin: this.startPin.value }, createDeliveryId()));
      this.delivery.set(response.data);
      if (response.catalog) this.units.set(response.catalog);
      this.resetStart();
      this.selectPanel('map');
      this.message.set('Reparto iniciado. Puedes comenzar a visitar los clientes.');
      await this.saveReferences();
      await this.refreshQueue();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudo iniciar el reparto.'));
    } finally {
      this.startPin.reset();
      this.busy.set(false);
    }
  }

  private startDetails(): Omit<StartDeliveryInput, 'pin'> | null {
    const mode = this.startMode();
    if (!mode || this.delivery()?.status === 'active') return null;
    if (!this.online()) {
      this.error.set('Necesitás conexión para iniciar un reparto.');
      return null;
    }
    const vehicle_id = this.selectedVehicleId();
    if (!vehicle_id) {
      this.error.set('Seleccioná un vehículo disponible para iniciar.');
      return null;
    }
    if (this.startOdometer.invalid) {
      this.startOdometer.markAsTouched();
      this.error.set('Revisá el kilometraje de salida.');
      return null;
    }
    const load = mode === 'empty' ? { start_without_load: true } : this.loadPayload(this.startForm);
    if (!load) return null;
    const odometer = this.startOdometer.value.trim().replace(',', '.');
    return { ...load, vehicle_id, ...(odometer ? { odometer_km: odometer } : {}) };
  }

  private resetStart(): void {
    this.startConfirmation.set(false);
    this.startMode.set(null);
    this.startPin.reset();
    this.startOdometer.reset();
    this.selectedVehicleId.set('');
    this.startForm.setControl('items', new FormArray([this.loadLine('', this.defaultStartUnitId())]));
    this.startForm.controls.production_unit_id.reset();
    this.startForm.markAsPristine();
    this.startForm.markAsUntouched();
  }

  openClient(client: DeliveryClient): void {
    if (!this.canUpdateDelivery() || this.busy() || this.closePending()) return;
    this.clearFeedback();
    this.selectedClient.set(client);
    this.stopMode.set((this.delivery()?.loaded_quantity ?? 0) === 0 || this.statusFor(client) !== 'pending' || client.status === 'inactive' || client.ready_for_delivery === false ? 'payment' : 'delivered');
    this.paymentChoice.set('');
    this.reviewing.set(null);
    this.stopSelections.set({});
    this.quantityControls.clear();
    this.priceControls.clear();
    this.stopForm.reset({ reason: '', notes: '', amount: '', payment_method: 'cash', payment_reference: '' });
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

  quantityControl(row: DeliveryUnitBalanceRow): FormControl<string> {
    const key = this.balanceKey(row);
    if (!this.quantityControls.has(key)) this.quantityControls.set(key, new FormControl(String(this.selectedUnitAmount(row)), {
      nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{1,10}(?:[.,]\d{1,3})?$/), Validators.min(0)],
    }));
    return this.quantityControls.get(key)!;
  }

  priceControl(row: DeliveryUnitBalanceRow): FormControl<string> {
    const key = this.balanceKey(row);
    if (!this.priceControls.has(key)) {
      const price = this.units().find((unit) => unit.id === row.unit && unit.eggs_per_unit === row.eggs_per_unit)?.default_unit_price;
      this.priceControls.set(key, new FormControl(price === null || price === undefined ? '' : String(price), {
        nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d+$/), Validators.min(0), Validators.max(2147483647)],
      }));
    }
    return this.priceControls.get(key)!;
  }

  setStopAmount(row: DeliveryUnitBalanceRow, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.quantityControl(row).setValue(value);
    const amount = /^\d{1,10}(?:[.,]\d{1,3})?$/.test(value) ? Number(value.replace(',', '.')) : NaN;
    this.stopSelections.update((selections) => ({ ...selections, [this.balanceKey(row)]: amount }));
  }

  canIncrementStopUnit(row: DeliveryUnitBalanceRow): boolean {
    if (row.remaining_amount === null) return false;
    const current = this.selectedUnitAmount(row);
    return this.selectedStopEggs() + this.stopIncrement(row, current) * row.eggs_per_unit <= 2147483647;
  }

  private stopIncrement(row: DeliveryUnitBalanceRow, current: number): number {
    const available = Number(row.remaining_amount);
    return current < available ? Math.min(1, available - current) : 1;
  }

  adjustStopUnit(row: DeliveryUnitBalanceRow, direction: -1 | 1): void {
    if (direction === 1 && !this.canIncrementStopUnit(row)) return;
    const current = this.selectedUnitAmount(row);
    const next = direction === 1 ? current + this.stopIncrement(row, current) : Math.max(0, current - 1);
    this.quantityControl(row).setValue(String(Math.round(next * 1000) / 1000));
    this.stopSelections.update((selections) => ({ ...selections, [this.balanceKey(row)]: Math.round(next * 1000) / 1000 }));
  }

  private selectedStopItems(): DeliveryStopItemInput[] {
    return (this.delivery()?.unit_balances?.rows ?? []).flatMap((row) => {
      const amount = this.selectedUnitAmount(row);
      return amount > 0 ? [{ unit: row.unit, eggs_per_unit: row.eggs_per_unit, amount: String(amount), unit_price: Number(this.priceControl(row).value) }] : [];
    });
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.clientSearchRequest++;
    this.clientPage.set(1);
    if (this.clientSearchTimer) clearTimeout(this.clientSearchTimer);
    this.clientSearchTimer = setTimeout(() => void this.refreshClients(this.search()), 400);
  }

  selectPanel(panel: 'clients' | 'map' | 'summary'): void {
    this.selectedMetric.set(null);
    this.panel.set(panel);
    setTimeout(() => void this.content?.scrollToTop(0));
  }

  setMapFocused(focused: boolean): void {
    if (this.mapFocused() === focused || (focused && !this.mapReady())) return;
    this.mapFocused.set(focused);
    this.profileOpen.set(false);
    afterNextRender(() => {
      this.map?.resize();
      this.mapModeToggle?.nativeElement.focus();
    }, { injector: this.injector });
  }

  openLoad(): void {
    if (!this.canUpdateDelivery() || this.closePending()) return;
    this.clearFeedback();
    this.reviewing.set(null);
    this.loadForm.controls.production_unit_id.reset();
    this.loadForm.controls.items.clear();
    this.loadForm.controls.items.push(this.loadLine('1', this.defaultUnitId()));
    this.loadOpen.set(true);
  }

  async addLoad(): Promise<void> {
    const delivery = this.delivery();
    if (!this.canUpdateDelivery() || !delivery || this.busy() || this.closePending()) return;
    const payload = this.loadPayload(this.loadForm);
    if (!payload) return;
    await this.persistBusiness('load', { ...payload, occurred_at: this.actionOccurredAt('load') }, createDeliveryId());
  }


  toggleProfile(): void {
    this.profileOpen.update((open) => !open);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }

  async saveStop(): Promise<void> {
    const delivery = this.delivery();
    const client = this.selectedClient();
    if (!this.canUpdateDelivery() || !delivery || !client || this.busy() || this.closePending()) return;
    if (delivery.loaded_quantity === 0 && this.stopMode() === 'delivered') {
      this.error.set('Agregá una carga de huevos antes de registrar entregas.');
      return;
    }

    if (this.stopMode() === 'payment') {
      const payment = this.paymentPayload();
      if (!payment) return;
      const key = createDeliveryId();
      await this.persistBusiness('payment', { ...payment, client_reference: client.id, client_event_id: key, occurred_at: this.actionOccurredAt('payment') }, key);
      return;
    }
    if (this.statusFor(client) !== 'pending' && !this.reviewing()) { this.error.set('La visita ya está registrada. Podés registrar otro cobro.'); return; }
    if (client.status === 'inactive' || client.ready_for_delivery === false) { this.error.set('El cliente necesita estar activo y tener dirección y ubicación para registrar una visita.'); return; }
    const delivered = this.stopMode() === 'delivered';
    if (delivered && !this.paymentChoice()) { this.error.set('Confirmá si la entrega es fiada o registrá el importe cobrado.'); return; }
    const payment = delivered && this.paymentChoice() === 'payment' ? this.paymentPayload() : { amount: '0.000' };
    if (!payment) return;
    if (delivered && (this.delivery()?.unit_balances?.rows ?? []).some((row) =>
      this.quantityControl(row).invalid || (row.remaining_amount === null && this.selectedUnitAmount(row) > 0)
      || this.selectedUnitAmount(row) > 0 && this.priceControl(row).invalid)) {
      this.error.set('Revisá las cantidades y los precios: usá pesos enteros para cada presentación elegida.');
      return;
    }
    const items = delivered ? this.selectedStopItems() : [];
    const quantity = delivered ? this.selectedStopEggs() : 0;
    const reason = this.stopForm.controls.reason.value.trim();
    if (delivered && (items.length === 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647)) {
      this.error.set('Elegí al menos una presentación disponible para entregar.');
      return;
    }
    if (!delivered && !reason) {
      this.error.set('Indicá por qué no se pudo entregar.');
      return;
    }

    const idempotencyKey = createDeliveryId();
    const payload: StopInput = {
      client_reference: client.id,
      status: delivered ? 'delivered' : 'not_delivered',
      occurred_at: this.actionOccurredAt('stop'),
      ...(delivered ? { accounting_version: 2, client_event_id: idempotencyKey, payment } : {}),
      ...(delivered ? { items } : {}),
      visit_reason: delivered ? 'Entrega realizada' : reason,
      notes: this.stopForm.controls.notes.value.trim() || undefined,
    };

    await this.persistBusiness('stop', payload, idempotencyKey);
  }

  private paymentPayload(): { amount: string; payment_method: DeliveryPaymentMethod; payment_reference?: string; reason?: string } | null {
    const values = this.stopForm.getRawValue();
    const amount = parseUyuAmount(values.amount);
    if (amount === null || amount <= 0n) { this.error.set('Ingresá un importe cobrado mayor a cero, con hasta tres decimales.'); return null; }
    return { amount: uyuDecimal(amount), payment_method: values.payment_method, payment_reference: values.payment_reference.trim() || undefined, reason: values.notes.trim() || undefined };
  }

  private async persistBusiness(kind: 'load' | 'stop' | 'payment', payload: AddDeliveryLoadInput | StopInput | DeliveryPaymentInput, key: string): Promise<void> {
    const delivery = this.delivery();
    const actorId = this.auth.user()?.id;
    const client = this.selectedClient();
    if (!delivery || !actorId) return;
    this.busy.set(true); this.clearFeedback();
    try {
      await this.outbox.enqueue({ kind, deliveryId: delivery.id, payload, idempotencyKey: key }, this.reviewing() ?? undefined);
      if (!this.isCurrentActor(actorId)) return;
      this.reviewing.set(null);
      if (kind === 'payment' && (payload as DeliveryPaymentInput).delivery_stop_id) this.editingStopId.set(null);
      if (kind === 'load') this.updateLocalLoad(this.loadEggs(payload as AddDeliveryLoadInput), key, (payload as AddDeliveryLoadInput).items, (payload as AddDeliveryLoadInput).production_unit_id, (payload as AddDeliveryLoadInput).occurred_at);
      if (kind === 'stop' && client) this.updateLocalStop(client, payload as StopInput, this.stopEggs(payload as StopInput));
      this.selectedClient.set(null); this.loadOpen.set(false);
      await this.refreshQueue(); await this.saveReferences();
      this.message.set('Operación guardada en este dispositivo. El saldo se confirma al sincronizar.');
      if (this.online()) await this.flushOutbox();
    } catch (error) {
      if (this.isCurrentActor(actorId)) this.error.set(this.errorMessage(error, 'No se pudo guardar la operación. Conservá los datos y reintentá.'));
    } finally { if (this.isCurrentActor(actorId)) this.busy.set(false); }
  }

  async reviewEntry(entry: DeliveryOutboxEntry, customerId = ''): Promise<void> {
    if (this.busy() || this.syncing()) return;
    if (entry.kind === 'load') {
      this.openLoad();
      const payload = entry.payload as AddDeliveryLoadInput;
      this.loadForm.controls.production_unit_id.setValue(payload.production_unit_id ?? null);
      this.loadForm.controls.items.clear();
      for (const item of payload.items ?? []) this.loadForm.controls.items.push(this.loadLine(item.amount, item.unit));
      this.reviewing.set(entry);
      return;
    }
    if (entry.kind !== 'stop' && entry.kind !== 'payment') return;
    if (entry.kind === 'payment') {
      const linked = entry.payload as DeliveryPaymentInput;
      if (linked.delivery_stop_id) {
        if (!this.canEditRegisteredStops()) {
          this.error.set('Conectate a tu reparto activo para revisar este cobro.');
          return;
        }
        const stop = this.delivery()?.stops?.find((candidate) => candidate.id === linked.delivery_stop_id);
        if (stop?.accounting_status !== 'posted' || stop.status !== 'delivered' || stop.client_reference !== linked.client_reference) {
          this.error.set('El cobro pendiente no corresponde a una entrega disponible de este cliente.');
          return;
        }
        this.clearFeedback();
        this.reviewing.set(entry);
        this.editingStopId.set(stop.id);
        return;
      }
    }
    const payload = { ...entry.payload, ...(customerId ? { client_reference: customerId } : {}) } as StopInput | DeliveryPaymentInput;
    let client = this.cachedClients().find((item) => item.id === payload.client_reference) ?? this.clients().find((item) => item.id === payload.client_reference);
    if (!client && this.online()) client = (await firstValueFrom(this.api.clients(payload.client_reference))).data.find((item) => item.id === payload.client_reference);
    if (!client) { this.error.set('Buscá y abrí el cliente real. Luego seleccioná este pendiente para revisarlo.'); return; }
    this.openClient(client); this.reviewing.set(entry);
    if (entry.kind === 'stop') {
      const stop = payload as StopInput;
      this.stopMode.set(stop.status === 'not_delivered' ? 'not_delivered' : 'delivered');
      for (const item of stop.items ?? []) {
        const row = this.delivery()?.unit_balances?.rows.find((balance) => this.balanceKey(balance) === this.balanceKey(item));
        if (row) { this.stopSelections.update((value) => ({ ...value, [this.balanceKey(row)]: Number(item.amount) })); this.quantityControl(row).setValue(item.amount); this.priceControl(row).setValue(String(item.unit_price ?? '')); }
      }
      this.stopForm.controls.reason.setValue(stop.visit_reason ?? ''); this.stopForm.controls.notes.setValue(stop.notes ?? '');
      if (stop.payment) {
        this.paymentChoice.set(parseUyuAmount(stop.payment.amount) === 0n ? 'fiado' : 'payment');
        this.stopForm.controls.amount.setValue(stop.payment.amount);
        this.stopForm.controls.payment_method.setValue(stop.payment.payment_method ?? 'cash');
        this.stopForm.controls.payment_reference.setValue(stop.payment.payment_reference ?? '');
      }
    } else {
      const payment = payload as DeliveryPaymentInput;
      this.stopMode.set('payment'); this.stopForm.patchValue({ amount: payment.amount, payment_method: payment.payment_method, payment_reference: payment.payment_reference ?? '', notes: payment.reason ?? '' });
    }
  }

  editRegisteredStop(stopId: number): void {
    if (!this.canEditRegisteredStops()) return;
    const stop = this.delivery()?.stops?.find((candidate) => candidate.id === stopId && candidate.status === 'delivered');
    if (!stop || stop.id <= 0) return;
    this.clearFeedback();
    if (this.pendingEntries().some((entry) => entry.kind === 'payment' && (entry.payload as DeliveryPaymentInput).delivery_stop_id === stopId)) {
      this.error.set('Hay un cobro pendiente para esta entrega. Revisalo en las operaciones pendientes.');
      return;
    }
    this.reviewing.set(null);
    this.editingStopId.set(stopId);
  }

  closeStopEditor(): void {
    if (this.stopEditor?.locked()) return;
    this.editingStopId.set(null);
    this.reviewing.set(null);
    this.clearFeedback();
  }

  async recordLinkedPayment(fields: Pick<DeliveryPaymentInput, 'amount' | 'payment_method' | 'payment_reference' | 'reason'>): Promise<void> {
    const stop = this.editingStop();
    if (!this.canEditRegisteredStops() || stop?.accounting_status !== 'posted' || stop.status !== 'delivered' || stop.id <= 0) {
      this.error.set('El cobro requiere conexión y una entrega confirmada de tu reparto activo.');
      return;
    }
    const key = createDeliveryId();
    await this.persistBusiness('payment', {
      ...fields, client_reference: stop.client_reference, delivery_stop_id: stop.id, client_event_id: key,
      occurred_at: this.actionOccurredAt('payment'),
    }, key);
  }

  async refreshRectifiedStop(message: string): Promise<void> {
    const actor = this.auth.user()?.id;
    if (!actor) return;
    this.editingStopId.set(null);
    this.reviewing.set(null);
    this.clearFeedback();
    this.busy.set(true);
    try {
      await this.refreshActiveDelivery();
      if (this.isCurrentActor(actor) && !this.error()) this.message.set(message);
    } finally {
      if (this.isCurrentActor(actor)) this.busy.set(false);
    }
  }

  async retryEntry(entry: DeliveryOutboxEntry): Promise<void> {
    try { await this.outbox.retry(entry); await this.refreshQueue(); await this.flushOutbox(); }
    catch (error) { this.error.set(this.errorMessage(error, 'No se pudo reintentar la operación.')); }
  }

  private isCurrentActor(id: number): boolean { return !this.destroyed && this.auth.user()?.id === id; }

  async openCloseConfirmation(): Promise<void> {
    if (this.busy() || !this.canUpdateDelivery()) return;
    if (!this.online()) {
      this.error.set('Necesitás conexión para sincronizar y confirmar la descarga final.');
      return;
    }
    this.busy.set(true);
    this.clearFeedback();
    try {
      await this.flushOutbox();
      if (this.pendingCount() > 0) {
        this.error.set('Sincronizá las operaciones pendientes antes de finalizar.');
        return;
      }
      await this.refreshActiveDelivery();
      if (!this.delivery()) return;
      this.prepareReturn();
      this.closeConfirmation.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private prepareReturn(): void {
    const delivery = this.delivery();
    this.returnLegacy.set((delivery?.unit_balances?.unallocated_delivered_eggs ?? 0) > 0 || !delivery?.unit_balances);
    this.returnLegacyQuantity.setValue(String(Math.max(0, delivery?.remaining_quantity ?? 0)));
    this.returnAmounts.clear();
    const rows = delivery?.unit_balances?.rows ?? [];
    this.returnRows.set(rows);
    for (const row of rows) this.returnAmounts.push(new FormControl(String(Math.max(0, Number(row.remaining_amount))), { nonNullable: true }));
    const origins = this.returnOrigins();
    this.returnUnit.setValue(origins.length === 1 ? origins[0].id : null);
    this.returnNotes.reset();
    this.closePrepared = true;
  }

  async closeDelivery(): Promise<void> {
    const delivery = this.delivery();
    if (!this.canUpdateDelivery() || !delivery || this.busy() || this.closePending()) return;
    if (this.closePin.invalid) {
      this.closePin.markAsTouched();
      this.error.set('Ingresá tu PIN de 4 dígitos para cerrar el reparto.');
      return;
    }
    if (this.closeOdometer.invalid) { this.closeOdometer.markAsTouched(); this.error.set('Revisá el kilometraje de cierre.'); return; }
    if (!this.online()) {
      this.error.set('Necesitás conexión para verificar el PIN y cerrar el reparto. Tus cambios pendientes siguen guardados.');
      this.closePin.reset();
      return;
    }

    if (!this.closePrepared) this.prepareReturn();
    let payload: CloseDeliveryInput;
    if (this.returnLegacy()) {
      const value = this.returnLegacyQuantity.value;
      if (!/^\d+$/.test(value)) { this.error.set('Indicá los huevos a devolver como un entero.'); return; }
      payload = { returned_quantity: Number(value), pin: this.closePin.value };
    } else {
      const items = this.returnRows().flatMap((row, index) => {
        const amount = this.returnAmounts.at(index).value.replace(',', '.').trim();
        return Number(amount) === 0 ? [] : [{ unit: row.unit, amount, eggs_per_unit: row.eggs_per_unit }];
      });
      if (items.some((item) => this.itemEggs(item) < 1)) {
        this.error.set('Cada presentación devuelta debe equivaler a huevos enteros.');
        return;
      }
      payload = items.length
        ? { returned_items: items, pin: this.closePin.value }
        : { returned_quantity: 0, pin: this.closePin.value };
    }
    const quantity = payload.returned_items?.reduce((total, item) => total + this.itemEggs(item), 0) ?? payload.returned_quantity ?? 0;
    if (quantity > 2147483647) { this.error.set('La descarga supera el máximo de huevos permitido.'); return; }
    if (delivery.remaining_quantity < 0) {
      this.error.set('El reparto tiene saldo negativo. Un administrador debe rectificar la entrega antes del cierre.');
      return;
    }
    if (quantity !== delivery.remaining_quantity) {
      this.error.set('La descarga final debe coincidir con todos los huevos sobrantes.');
      return;
    }
    if (quantity > 0 && !this.returnUnit.value) { this.error.set('Seleccioná la UP donde descargar todos los sobrantes.'); return; }
    if (quantity > 0 && this.returnUnit.value) payload.return_production_unit_id = this.returnUnit.value;
    payload.notes = this.returnNotes.value.trim() || 'Cierre desde modo repartidor';
    const closingOdometer = this.closeOdometer.value.trim().replace(',', '.');
    if (closingOdometer) payload.odometer_km = closingOdometer;
    const idempotencyKey = createDeliveryId();
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
      if (!this.online()) throw new HttpErrorResponse({ status: 0 });
      const response = await firstValueFrom(this.api.close(delivery.id, payload, idempotencyKey));
      for (const entry of await this.outbox.list(delivery.id)) if (entry.kind === 'close') await this.outbox.remove(entry.id);
      this.delivery.set(response.data);
      this.closeConfirmation.set(false);
      this.closeOdometer.reset();
      this.closePrepared = false;
      await this.saveReferences();
      this.message.set('Reparto cerrado correctamente.');
      await this.refreshQueue();
    } catch (error) {
      this.error.set(this.isNetworkFailure(error)
        ? 'No se pudo verificar el PIN sin conexión. Reintentá el cierre cuando vuelva la señal.'
        : this.errorMessage(error, 'No se pudo cerrar el reparto.'));
    } finally {
      this.closePin.reset();
      this.busy.set(false);
    }
  }

  async syncNow(): Promise<void> {
    if (!this.canUpdateDelivery() || !this.online() || !this.delivery()) return;
    await this.flushOutbox();
    await this.refreshActiveDelivery();
  }

  async recordVehicleFuel(): Promise<void> {
    const delivery = this.delivery();
    if (!this.canManageFuel() || delivery?.status !== 'active' || !delivery.vehicle || !delivery.vehicle_usage?.id || this.fuelSaving()) return;
    if (this.fuelForm.invalid) { this.fuelForm.markAllAsTouched(); return; }
    const value = this.fuelForm.getRawValue();
    const payload: VehicleFuelInput = {
      vehicle_id: delivery.vehicle.id,
      usage_id: delivery.vehicle_usage.id,
      liters: value.liters.replace(',', '.'),
      fuel_type: value.fuel_type.trim(),
      amount: value.amount.replace(',', '.'),
      occurred_at: new Date().toISOString(),
      ...(value.supplier.trim() ? { supplier: value.supplier.trim() } : {}),
      ...(value.odometer_km.trim() ? { odometer_km: value.odometer_km.trim().replace(',', '.') } : {}),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
      ...(this.fuelReceipt() ? { receipt: this.fuelReceipt()! } : {}),
    };
    const idempotencyKey = createDeliveryId();
    this.fuelSaving.set(true);
    this.clearFeedback();
    try {
      await this.outbox.enqueue({ kind: 'fuel', deliveryId: delivery.id, payload, idempotencyKey });
      this.fuelReceipt.set(null);
      this.fuelForm.reset({ liters: '', fuel_type: 'Nafta', amount: '', supplier: '', odometer_km: '', notes: '' });
      await this.refreshQueue();
      if (this.online()) {
        await this.flushOutbox();
        if (this.pendingEntries().some((entry) => entry.idempotencyKey === idempotencyKey)) this.message.set('La carga quedó guardada en este reparto y se sincronizará al resolver el pendiente.');
        else this.message.set('Carga de combustible registrada.');
      } else {
        this.message.set('Carga de combustible guardada para sincronizar con este reparto.');
      }
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudo registrar ni guardar la carga de combustible.'));
    } finally { this.fuelSaving.set(false); }
  }

  setFuelReceipt(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fuelReceipt.set(input.files?.[0] ?? null);
  }

  readonly paidCustomerIds = computed(() => new Set((this.delivery()?.account_movements ?? []).filter((movement) => movement.type === 'payment' && !movement.reversal_id).flatMap((movement) => movement.customer_id ? [movement.customer_id] : [])));
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

  private async flushOutbox(): Promise<void> {
    const delivery = this.delivery(); const actorId = this.auth.user()?.id;
    if (!this.canUpdateDelivery() || !delivery || !actorId || !this.online() || this.syncing()) return;
    this.syncing.set(true);
    let replayedBusiness = false;
    try {
      const entries = await this.outbox.list(delivery.id);
      for (const entry of entries) {
        if (!this.isCurrentActor(actorId)) return;
        if (entry.kind === 'close') continue;
        if (entry.state === 'needs_review') break;
        try {
          await this.sendOutboxEntry(entry);
          await this.outbox.remove(entry.id);
          if (entry.kind !== 'locations') replayedBusiness = true;
        } catch (error) {
          const message = this.errorMessage(error, 'No se pudo sincronizar una operación. Revisá los pendientes.');
          if (!this.isCurrentActor(actorId)) return;
          if (error instanceof HttpErrorResponse && [400, 403, 404, 409, 422].includes(error.status)) {
            await this.outbox.reject(entry, message);
            replayedBusiness = true;
          }
          this.error.set(message); break;
        }
      }
    } catch (error) { if (this.isCurrentActor(actorId)) this.error.set(this.errorMessage(error, 'No se pudo leer la cola local.')); }
    finally { if (this.isCurrentActor(actorId)) { this.syncing.set(false); await this.refreshQueue(); } }
    if (replayedBusiness && this.isCurrentActor(actorId)) {
      await this.refreshActiveDelivery(); await this.refreshClients(this.search(), this.clientPage());
      if (this.pendingCount() === 0 && !this.error()) this.message.set('Operaciones confirmadas. El saldo y el resumen están actualizados.');
    }
  }

  private async sendOutboxEntry(entry: DeliveryOutboxEntry): Promise<Delivery | void> {
    if (entry.kind === 'locations') {
      await firstValueFrom(this.api.locations(entry.deliveryId, (entry.payload as { locations: LocationInput[] }).locations));
      return;
    }
    if (!entry.idempotencyKey) throw new Error('La cola no tiene una clave de idempotencia.');
    if (entry.kind === 'load') {
      return (await firstValueFrom(this.api.load(entry.deliveryId, { ...(entry.payload as AddDeliveryLoadInput), production_unit_id: (entry.payload as AddDeliveryLoadInput).production_unit_id ?? this.delivery()?.production_unit?.id }, entry.idempotencyKey))).data;
    }
    if (entry.kind === 'payment') {
      await firstValueFrom(this.api.payment(entry.deliveryId, entry.payload as DeliveryPaymentInput, entry.idempotencyKey));
      return;
    }
    if (entry.kind === 'fuel') {
      const fuel = entry.payload as VehicleFuelInput;
      const active = this.delivery();
      if (!active || active.id !== entry.deliveryId || active.vehicle?.id !== fuel.vehicle_id || active.vehicle_usage?.id !== fuel.usage_id) {
        throw new Error('La carga de combustible pertenece a otro uso y no se reasignará.');
      }
      await firstValueFrom(this.vehiclesApi.recordFuel(fuel.vehicle_id, fuel, entry.idempotencyKey));
      return;
    }
    if (entry.kind === 'stop') {
      await firstValueFrom(this.api.stop(entry.deliveryId, entry.payload as StopInput, entry.idempotencyKey));
      return;
    }
    throw new Error('El cierre requiere confirmar el PIN en línea.');
  }

  private async refreshActiveDelivery(): Promise<void> {
    if (!this.online()) return;
    const actorId = this.auth.user()?.id;
    if (!actorId) return;
    try {
      const response = await firstValueFrom(this.api.current());
      const active = response.data[0] ?? null;
      if (active) {
        const detail = (await firstValueFrom(this.api.detail(active.id))).data;
        if (!this.isCurrentActor(actorId) || detail.driver?.id !== actorId) return;
        await this.outbox.claimLegacy(detail);
        const queued = await this.outbox.list(detail.id);
        this.delivery.set(detail);
        // Reaplicar operaciones todavía no confirmadas sin asignar clientes al recorrido.
        for (const entry of queued) {
          if (entry.state === 'needs_review') continue;
          if (entry.kind === 'load' && entry.idempotencyKey
            && !detail.loads?.some((load) => load.idempotency_key === entry.idempotencyKey)) {
            const payload = entry.payload as AddDeliveryLoadInput;
            this.updateLocalLoad(this.loadEggs(payload), entry.idempotencyKey, payload.items, payload.production_unit_id ?? detail.production_unit?.id, payload.occurred_at);
          }
          if (entry.kind === 'stop') {
            const payload = entry.payload as StopInput;
            const client = this.cachedClients().find((item) => item.id === payload.client_reference);
            if (client && this.statusFor(client) === 'pending') this.updateLocalStop(client, payload, this.stopEggs(payload));
          }
        }
        this.closePending.set(false);
      }
      else if (this.delivery()?.status === 'active') this.delivery.set(null);
      await this.refreshQueue();
      await this.saveReferences();
    } catch (error) {
      if (!this.error()) this.error.set(this.errorMessage(error, 'No se pudo actualizar el reparto. Los pendientes se conservan en este dispositivo.'));
    }
  }

  private async refreshQueue(): Promise<void> {
    const delivery = this.delivery();
    const entries = delivery ? await this.outbox.list(delivery.id) : [];
    this.pendingEntries.set(entries);
    this.pendingCount.set(entries.filter((entry) => entry.kind !== 'close').length);
  }

  async refreshClients(search = '', page = 1): Promise<void> {
    if (!this.online()) return;
    const request = ++this.clientSearchRequest; const actorId = this.auth.user()?.id;
    this.clientsLoading.set(true);
    try {
      const response = await firstValueFrom(this.api.clients(search, page, this.clientStatus() || undefined));
      if (request !== this.clientSearchRequest || !actorId || !this.isCurrentActor(actorId)) return;
      this.clients.set(response.data);
      this.clientPage.set(response.meta?.current_page ?? page); this.clientLastPage.set(response.meta?.last_page ?? 1); this.clientTotal.set(response.meta?.total ?? response.data.length);
      const cache = new Map(this.cachedClients().map((client) => [client.id, client]));
      for (const client of response.data) cache.set(client.id, client);
      this.cachedClients.set([...cache.values()]);
      await this.saveReferences();
    } catch (error) {
      if (request === this.clientSearchRequest && actorId && this.isCurrentActor(actorId)) this.error.set(this.errorMessage(error, 'No se pudo cargar la lista de clientes.'));
    } finally { if (request === this.clientSearchRequest) this.clientsLoading.set(false); }
  }

  changeClientStatus(event: Event): void {
    this.clientStatus.set((event.target as HTMLSelectElement).value); this.clientPage.set(1);
    void this.refreshClients(this.search()); this.scheduleMap();
  }
  private scheduleMap(): void {
    if (this.mapTimer) clearTimeout(this.mapTimer);
    this.mapTimer = setTimeout(() => void this.refreshMap(), 350);
  }
  changeMapVisit(event: Event): void { this.mapVisitStatus.set((event.target as HTMLSelectElement).value); void this.refreshMap(); }

  async refreshMap(): Promise<void> {
    if (!this.map || !this.online()) { this.updateMapMarkers(); return; }
    const bounds = this.map.getBounds();
    if (!bounds) return;
    const request = ++this.mapRequest; const actorId = this.auth.user()?.id;
    try {
      const response = await firstValueFrom(this.api.markers({ west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth(), limit: 200,
        ...(this.clientStatus() ? { status: this.clientStatus() } : {}),
        ...(this.delivery() ? { delivery_id: this.delivery()!.id } : {}), ...(this.mapVisitStatus() ? { visit_status: this.mapVisitStatus() } : {}) }));
      if (request !== this.mapRequest || !actorId || !this.isCurrentActor(actorId)) return;
      this.mapClients.set(response.data); this.mapHasMore.set(response.meta.has_more); this.updateMapMarkers();
    } catch { if (request === this.mapRequest) this.mapError.set('No se pudieron cargar los puntos. Podés continuar desde Clientes.'); }
  }
  async openMapClient(client: DeliveryClient): Promise<void> {
    if (!this.online()) { const cached = this.cachedClients().find((item) => item.id === client.id); if (cached) this.openClient(cached); return; }
    const actorId = this.auth.user()?.id;
    try {
      const response = await firstValueFrom(this.api.clients(client.id));
      const full = response.data.find((item) => item.id === client.id);
      if (full && actorId && this.isCurrentActor(actorId)) {
        this.cachedClients.update((items) => [...items.filter((item) => item.id !== full.id), full]); this.openClient(full); await this.saveReferences();
      }
    } catch (error) { this.error.set(this.errorMessage(error, 'No se pudo abrir el cliente.')); }
  }

  private async saveReferences(): Promise<void> {
    const actorId = this.auth.user()?.id;
    if (!actorId || typeof this.outbox.saveReferences !== 'function') return;
    try {
      await this.outbox.saveReferences({ actorId, units: this.units(), productionUnits: this.productionUnits(), clients: this.cachedClients(), delivery: this.delivery() });
    } catch {
      this.error.set('La operación está registrada, pero no se pudo guardar el catálogo local. Volvé a conectarte antes de operar sin conexión.');
    }
  }

  private async refreshProductionUnits(): Promise<void> {
    if (!this.online()) return;
    try {
      this.productionUnits.set((await firstValueFrom(this.api.productionUnits())).data);
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudieron consultar las unidades productivas para cargar.'));
    }
  }

  async refreshVehicles(): Promise<void> {
    if (!this.online() || this.vehiclesLoading()) return;
    this.vehiclesLoading.set(true);
    try {
      const vehicles = (await firstValueFrom(this.vehiclesApi.available())).data;
      this.availableVehicles.set(vehicles);
      if (!vehicles.some((vehicle) => vehicle.id === this.selectedVehicleId())) this.selectedVehicleId.set('');
    } catch (error) {
      this.error.set(this.errorMessage(error, 'No se pudieron consultar los vehículos disponibles.'));
    } finally {
      this.vehiclesLoading.set(false);
    }
  }

  private async refreshUnits(): Promise<void> {
    if (!this.online()) return;
    try {
      const response = await firstValueFrom(this.api.units());
      this.units.set(response.data);
      const first = this.defaultUnitId();
      if (!this.startForm.controls.items.at(0).controls.unit.value) {
        this.startForm.controls.items.at(0).controls.unit.setValue(this.defaultStartUnitId());
      }
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

  addStartLine(): void {
    const items = this.startForm.controls.items;
    if (items.length < 20) items.push(this.loadLine('', this.defaultUnitId()));
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

  private loadPayload(form: LoadForm): { items: DeliveryLoadItemInput[]; production_unit_id: number } | null {
    const items = form.controls.items.controls.map((line) => {
      const unit = this.units().find((entry) => entry.id === line.controls.unit.value);
      return unit ? { unit: unit.id, amount: line.controls.amount.value.replace(',', '.').trim(), eggs_per_unit: unit.eggs_per_unit } : null;
    });
    const total = items.reduce((sum, item) => sum + (item ? this.itemEggs(item) : 0), 0);
    if (form.invalid || items.some((item) => !item || this.itemEggs(item) < 1) || total < 1 || total > 2147483647) {
      form.markAllAsTouched();
      this.error.set(!form.controls.production_unit_id.value ? 'Seleccioná la unidad productiva de origen de esta carga.' : 'Revisá las unidades y cantidades: cada línea debe equivaler a huevos enteros.');
      return null;
    }

    if (!form.controls.production_unit_id.value) {
      this.error.set('Seleccioná la unidad productiva de origen de esta carga.');
      return null;
    }
    return { items: items as DeliveryLoadItemInput[], production_unit_id: form.controls.production_unit_id.value };
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
    if (this.destroyed || this.map || !element.isConnected) return;
    this.mapError.set(null);
    if (!this.mapAccessToken) {
      this.mapError.set('Falta configurar el acceso a Mapbox. Podés continuar desde Clientes.');
      return;
    }
    let map: MapboxMap;
    try {
      mapboxgl.workerUrl = mapboxWorkerUrl();
      map = new mapboxgl.Map({
        container: element,
        accessToken: this.mapAccessToken,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-56.218, -34.73],
        zoom: 12,
        projection: 'mercator',
        renderWorldCopies: false,
      });
    } catch {
      this.mapError.set('No se pudo abrir el mapa en este dispositivo. Podés continuar desde Clientes.');
      return;
    }
    this.map = map;
    this.mapReady.set(true);
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('error', () => this.mapError.set('Mapbox no pudo cargar el mapa. Podés continuar desde Clientes.'));
    map.on('load', () => this.mapError.set(null));
    map.on('moveend', () => this.scheduleMap());
    if (typeof ResizeObserver !== 'undefined') {
      this.mapResizeObserver = new ResizeObserver(() => {
        if (this.map === map) map.resize();
      });
      this.mapResizeObserver.observe(element);
    }
    this.scheduleMap();
    this.updateMapMarkers();
    this.fitMapToClients();
    void this.centerOnLocation();
  }

  async centerOnLocation(): Promise<void> {
    const map = this.map;
    if (!map || this.locationLoading()) return;
    this.locationLoading.set(true);
    this.locationError.set(null);
    try {
      const { latitude, longitude } = await this.location.getCurrentPosition();
      if (this.map !== map) return;
      if (!this.currentMarker) {
        const element = document.createElement('span');
        element.className = 'delivery-driver-position';
        element.setAttribute('aria-hidden', 'true');
        this.currentMarker = new mapboxgl.Marker({ element }).setLngLat([longitude, latitude]).addTo(map);
      } else {
        this.currentMarker.setLngLat([longitude, latitude]);
      }
      map.jumpTo({ center: [longitude, latitude], zoom: 17 });
    } catch (error) {
      if (this.map === map) this.locationError.set(this.errorMessage(error, 'No se pudo obtener tu ubicación.'));
    } finally {
      if (this.map === map) this.locationLoading.set(false);
    }
  }

  private removeMap(): void {
    this.mapResizeObserver?.disconnect();
    this.mapResizeObserver = undefined;
    this.currentMarker?.remove();
    for (const marker of this.markers.values()) marker.remove();
    const map = this.map;
    this.map = null;
    map?.remove();
    this.mapReady.set(false);
    this.mapFocused.set(false);
    if (this.mapTimer) clearTimeout(this.mapTimer);
    this.mapRequest++;
    this.markers.clear();
    this.currentMarker = null;
    this.locationLoading.set(false);
    this.locationError.set(null);
  }

  private fitMapToClients(): void {
    const map = this.map;
    if (!map) return;
    const bounds = new mapboxgl.LngLatBounds();
    for (const client of this.clients()) {
      if (client.latitude !== null && client.longitude !== null) bounds.extend([Number(client.longitude), Number(client.latitude)]);
    }
    if (bounds.isEmpty()) return;
    const element = map.getContainer();
    const controlsBottom = element.closest('ion-content')?.querySelector('.map-controls')?.getBoundingClientRect().bottom ?? 0;
    const topPadding = Math.min(Math.max(32, controlsBottom - element.getBoundingClientRect().top + 16), Math.max(32, element.clientHeight - 80));
    map.fitBounds(bounds, {
      padding: { top: topPadding, right: 24, bottom: 24, left: 24 },
      maxZoom: 15,
      duration: 0,
      retainPadding: false,
    });
  }

  private updateMapMarkers(): void {
    if (!this.map) return;
    const clients = (this.online() ? this.mapClients() : this.cachedClients()).filter((client) => client.latitude !== null && client.longitude !== null);
    const visible = new Set(clients.map((client) => client.id));
    for (const [id, marker] of this.markers) {
      if (!visible.has(id)) { marker.remove(); this.markers.delete(id); }
    }
    for (const client of clients) {
      const visited = this.statusFor(client) !== 'pending' || client.visit_status === 'paid' || client.visit_status === 'visited' || client.visit_status === 'delivered';
      let marker = this.markers.get(client.id);
      if (!marker) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'delivery-client-pin';
        element.addEventListener('click', () => void this.openMapClient(client));
        marker = new mapboxgl.Marker({ element }).setLngLat([Number(client.longitude), Number(client.latitude)]).addTo(this.map);
        this.markers.set(client.id, marker);
      }
      const element = marker.getElement();
      element.title = client.name;
      element.setAttribute('aria-label', client.name);
      element.classList.toggle('visited', visited);
    }
  }

  private stopEggs(payload: StopInput): number {
    return payload.items?.reduce((total, item) => total + this.itemEggs(item), 0) ?? 0;
  }

  private updateLocalStop(client: DeliveryClient, payload: StopInput, quantity: number): void {
    this.delivery.update((delivery) => delivery ? {
      ...delivery,
      stops: [...(delivery.stops ?? []).filter((stop) => stop.client_reference !== client.id), {
        id: -1, client_reference: client.id, client_name: client.name, address: client.address ?? '',
        latitude: client.latitude ?? 0, longitude: client.longitude ?? 0, sequence: 0, status: payload.status,
        items: payload.items?.map((item) => ({ ...item, label: delivery.unit_balances?.rows.find((row) =>
          row.unit === item.unit && row.eggs_per_unit === item.eggs_per_unit)?.label ?? this.unitLabel(item.unit), eggs: this.itemEggs(item) })) ?? [],
        delivered_quantity: quantity, visit_reason: payload.visit_reason ?? null, notes: payload.notes ?? null,
        visited_at: payload.occurred_at ?? new Date().toISOString(),
      }],
      delivered_quantity: delivery.delivered_quantity + quantity,
      delivered_amount: null,
      remaining_quantity: delivery.remaining_quantity - quantity,
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

  private updateLocalLoad(quantity: number, idempotencyKey: string, items?: DeliveryLoadItemInput[], productionUnitId?: number, occurredAt = new Date().toISOString()): void {
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
        production_unit: this.productionUnits().find((unit) => unit.id === productionUnitId) ?? (productionUnitId === delivery.production_unit?.id ? delivery.production_unit : null),
        items: loadedItems.map((item) => ({ ...item, label: this.unitLabel(item.unit),
          category: this.units().find((unit) => unit.id === item.unit)?.category ?? '', eggs: this.itemEggs(item) })),
        created_at: occurredAt, occurred_at: occurredAt,
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

  private actionOccurredAt(kind: 'load' | 'stop' | 'payment'): string {
    const entry = this.reviewing();
    if (entry?.kind === kind) {
      const original = (entry.payload as AddDeliveryLoadInput | StopInput | DeliveryPaymentInput).occurred_at;
      if (original) return original;
    }
    return new Date().toISOString();
  }

  private errorMessage(error: unknown, fallback: string): string {
    const body = (error as { error?: { message?: string; errors?: Record<string, string[]> } })?.error;
    return Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? (error instanceof Error && !(error instanceof HttpErrorResponse) ? error.message : fallback);
  }

}
