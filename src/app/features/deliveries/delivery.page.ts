import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, isDevMode, signal } from '@angular/core';
import { DialogFocusDirective } from '../../shared/ui/dialog-focus.directive';
import { toSignal } from '@angular/core/rxjs-interop';
import { parseUyuAmount, uyuDecimal } from '../../shared/utils/uyu-money';
import { PaymentMethod } from '../customers/types/customer.types';
import { DeliveryClientRowComponent } from './components/delivery-client-row.component';
import { DeliveryPendingOperationsComponent } from './components/delivery-pending-operations.component';
import { DeliveryFinancialSummaryComponent } from './components/delivery-financial-summary.component';
import { DeliveryStartOptionsComponent } from './components/delivery-start-options.component';
import { DeliveryVehicleFuelFormComponent } from './components/delivery-vehicle-fuel-form.component';
import { Capacitor } from '@capacitor/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import * as L from 'leaflet/dist/leaflet-src.esm.js';
import {
  IonContent,
  IonHeader,
  IonIcon,
  Platform,
  IonSpinner,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, checkmarkCircleOutline, locationOutline, mapOutline, moonOutline, peopleOutline, removeOutline, sunnyOutline, syncOutline, statsChartOutline, trashOutline, wifiOutline } from 'ionicons/icons';

import { postLoginPath } from '../../core/auth/access-policy';
import { AuthStore } from '../../core/auth/auth.store';
import { LocationSample, LocationService } from '../../core/native/location.service';
import { NetworkService } from '../../core/native/network.service';
import { ServerHealthService } from '../../core/api/server-health.service';
import { ThemeService } from '../../core/theme/theme.service';
import { DeliveryOutboxEntry, DeliveryOutboxService } from './delivery-outbox.service';
import { DeliveriesApi } from './deliveries.api';
import { VehiclesApi } from '../vehicles/services/vehicles.api';
import { VehicleFuelInput, VehicleOption } from '../vehicles/interfaces/vehicle';
import { formatFuelLiters } from '../vehicles/vehicle-format';
import { DeliveryUnitRowComponent } from './components/delivery-unit-row.component';
import { formatDeliveryMoney } from './delivery-money';
import { AddDeliveryLoadInput, Delivery, DeliveryClient, DeliveryLoadItemInput, DeliveryStop, DeliveryUnit, DeliveryUnitBalanceRow, DeliveryProductionUnit, DeliveryStopItemInput, CloseDeliveryInput, DeliveryPaymentInput, LocationInput, StartDeliveryInput, StopInput } from './delivery.models';

type LoadLineForm = FormGroup<{ unit: FormControl<string>; amount: FormControl<string> }>;
type LoadForm = FormGroup<{ items: FormArray<LoadLineForm>; production_unit_id: FormControl<number | null> }>;
type DeliveryMetric = 'loaded' | 'delivered' | 'remaining';

@Component({
  selector: 'app-delivery',
  templateUrl: './delivery.page.html',
  styleUrl: './delivery.page.scss',
  imports: [
    DialogFocusDirective, DeliveryClientRowComponent, DeliveryPendingOperationsComponent, DeliveryFinancialSummaryComponent, DeliveryStartOptionsComponent, DeliveryVehicleFuelFormComponent, DeliveryUnitRowComponent, DatePipe, IonContent, IonHeader, IonIcon, IonSpinner, IonToolbar, ReactiveFormsModule, RouterLink,
  ],
})
export class DeliveryPage implements AfterViewInit, OnDestroy {
  @ViewChild(IonContent) private content?: IonContent;

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
  readonly native = Capacitor.isNativePlatform();
  readonly canOperate = this.native || isDevMode();
  readonly canManageFuel = computed(() => this.auth.user()?.roles.includes('admin') === true || this.auth.user()?.permissions?.some((permission) => ['vehicles.fuel.manage', 'delivery.fuel.record'].includes(permission)) === true);
  readonly profileOpen = signal(false);
  readonly panel = signal<'clients' | 'map' | 'summary'>('clients');
  readonly dialogOpen = computed(() => !!this.selectedClient() || this.loadOpen() || this.noLoadConfirmation() || this.startConfirmation() || this.closeConfirmation() || !!this.selectedMetric());
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
  readonly mapVisitStatus = signal('');
  readonly visibleClients = computed(() => {
    if (this.online()) return this.clients();
    const query = this.search().trim().toLocaleLowerCase('es-UY');
    return this.cachedClients().filter((client) => (!query || `${client.name} ${client.address ?? ''}`.toLocaleLowerCase('es-UY').includes(query)) && (!this.clientStatus() || client.status === this.clientStatus()));
  });
  readonly pendingEntries = signal<DeliveryOutboxEntry[]>([]);
  readonly reviewing = signal<DeliveryOutboxEntry | null>(null);
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
  readonly noLoadConfirmation = signal(false);
  readonly startWithoutLoad = signal(false);
  readonly vehiclesLoading = signal(false);
  readonly closePending = signal(false);
  readonly startPin = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[0-9]{4}$/)] });
  readonly closePin = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[0-9]{4}$/)] });
  readonly lastPosition = signal<LocationInput | null>(null);
  readonly startForm = new FormGroup({
    production_unit_id: new FormControl<number | null>(null, Validators.required),
    items: new FormArray<LoadLineForm>([this.loadLine('')]),
  });
  readonly loadForm = new FormGroup({
    production_unit_id: new FormControl<number | null>(null, Validators.required),
    items: new FormArray<LoadLineForm>([this.loadLine('1')]),
  });
  readonly stopForm = new FormGroup({
    reason: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    amount: new FormControl('', { nonNullable: true }),
    payment_method: new FormControl<PaymentMethod>('cash', { nonNullable: true }),
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

  private map: L.Map | null = null;
  private readonly markers = new Map<string, L.CircleMarker>();
  private currentMarker: L.CircleMarker | null = null;
  private locationWatch: string | number | null = null;
  private locationBatch: LocationInput[] = [];
  private lastLocationFlush = 0;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private clientSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private clientSearchRequest = 0;
  private backButtonSubscription?: Subscription;
  private mapRequest = 0;
  private mapTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private readonly unitAmountFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 3 });

  constructor() {
    addIcons({ addOutline, checkmarkCircleOutline, locationOutline, mapOutline, moonOutline, peopleOutline, removeOutline, sunnyOutline, syncOutline, statsChartOutline, trashOutline, wifiOutline });
    let owner = this.auth.user()?.id;
    effect(() => {
      const next = this.auth.user()?.id;
      if (next !== owner) {
        owner = next;
        this.delivery.set(null); this.clients.set([]); this.cachedClients.set([]); this.mapClients.set([]);
        this.pendingEntries.set([]); this.pendingCount.set(0); this.selectedClient.set(null);
        this.loadOpen.set(false); this.closeConfirmation.set(false); this.startConfirmation.set(false);
        this.busy.set(false); this.syncing.set(false); this.clearFeedback();
        this.startPin.reset(); this.closePin.reset(); this.map?.remove(); this.map = null;
        this.availableVehicles.set([]); this.selectedVehicleId.set(''); this.startOdometer.reset(); this.closeOdometer.reset();
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
    await Promise.all([this.refreshUnits(), this.refreshProductionUnits(), this.refreshClients(), this.refreshVehicles()]);
    await this.refreshActiveDelivery();
    await this.refreshQueue();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.serverHealth.stop();
    this.backButtonSubscription?.unsubscribe();
    if (this.mapTimer) clearTimeout(this.mapTimer);
    if (this.locationWatch !== null) void this.location.clearWatch(this.locationWatch);
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    if (this.clientSearchTimer) clearTimeout(this.clientSearchTimer);
    this.map?.remove();
    this.map = null;
  }

  ionViewDidEnter(): void {
    this.serverHealth.start();
    this.backButtonSubscription?.unsubscribe();
    this.backButtonSubscription = this.platform.backButton.subscribeWithPriority(1000, (processNextHandler) => {
      if (this.profileOpen()) { this.profileOpen.set(false); return; }
      if (this.selectedMetric()) { this.selectedMetric.set(null); return; }
      if (this.selectedClient()) { this.selectedClient.set(null); return; }
      if (this.loadOpen()) { this.loadOpen.set(false); return; }
      if (this.noLoadConfirmation()) { this.cancelNoLoadStart(); return; }
      if (this.startConfirmation()) { this.cancelStartConfirmation(); return; }
      if (this.closeConfirmation()) { this.closeConfirmation.set(false); this.closePin.reset(); return; }
      if (this.delivery()?.status === 'active') {
        if (this.panel() !== 'clients') this.selectPanel('clients');
        return;
      }
      processNextHandler();
    });
  }

  ionViewWillLeave(): void {
    this.serverHealth.stop();
    this.backButtonSubscription?.unsubscribe();
    this.backButtonSubscription = undefined;
  }

  openStartConfirmation(): void {
    if (!this.canOperate || this.busy() || !this.units().length) return;
    if (!this.selectedVehicleId()) { this.error.set('Seleccioná un vehículo disponible para iniciar.'); return; }
    if (this.startOdometer.invalid) { this.startOdometer.markAsTouched(); this.error.set('Revisá el kilometraje de salida.'); return; }
    this.startWithoutLoad.set(false);
    if (!this.loadPayload(this.startForm)) return;
    if (!this.online()) {
      this.error.set('Necesitás conexión para iniciar un reparto.');
      return;
    }
    this.clearFeedback();
    this.startPin.reset();
    this.startConfirmation.set(true);
  }

  openNoLoadConfirmation(): void {
    if (!this.canOperate || this.busy()) return;
    if (!this.selectedVehicleId()) { this.error.set('Seleccioná un vehículo disponible para iniciar.'); return; }
    if (this.startOdometer.invalid) { this.startOdometer.markAsTouched(); this.error.set('Revisá el kilometraje de salida.'); return; }
    if (!this.online()) {
      this.error.set('Necesitás conexión para iniciar un reparto.');
      return;
    }
    this.clearFeedback();
    this.startWithoutLoad.set(true);
    this.noLoadConfirmation.set(true);
  }

  confirmNoLoadStart(): void {
    if (!this.startWithoutLoad() || !this.online() || this.busy()) return;
    this.noLoadConfirmation.set(false);
    this.startPin.reset();
    this.startConfirmation.set(true);
  }

  cancelNoLoadStart(): void {
    this.noLoadConfirmation.set(false);
    this.startWithoutLoad.set(false);
  }

  cancelStartConfirmation(): void {
    this.startConfirmation.set(false);
    this.startPin.reset();
    this.startWithoutLoad.set(false);
  }

  async startDelivery(): Promise<void> {
    if (!this.canOperate) return;
    if (this.busy()) return;
    if (this.startPin.invalid) {
      this.startPin.markAsTouched();
      this.error.set('Ingresá tu PIN de 4 dígitos para iniciar el reparto.');
      return;
    }
    const loadPayload = this.startWithoutLoad() ? { start_without_load: true } : this.loadPayload(this.startForm);
    if (!loadPayload) return;
    if (!this.online()) {
      this.error.set('Necesitas conexión para iniciar un reparto. Luego podrás continuar sin señal.');
      return;
    }

    this.busy.set(true);
    this.clearFeedback();
    try {
      const odometer = this.startOdometer.value.trim().replace(',', '.');
      const response = await firstValueFrom(this.api.start({ ...loadPayload, vehicle_id: this.selectedVehicleId(), ...(odometer ? { odometer_km: odometer } : {}), pin: this.startPin.value }, this.newId()));
      this.delivery.set(response.data);
      if (response.catalog) this.units.set(response.catalog);
      await this.saveReferences();
      this.startConfirmation.set(false);
      this.startWithoutLoad.set(false);
      this.startOdometer.reset();
      this.selectedVehicleId.set('');
      this.panel.set('clients');
      await this.content?.scrollToTop(0);
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
    if (!this.canOperate || this.busy() || this.closePending()) return;
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
      nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{1,10}(?:[.,]\d{1,3})?$/), Validators.min(0), Validators.max(Number(row.remaining_amount ?? 0))],
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
    const next = Math.min(Number(row.remaining_amount), current + 1);
    return next > current && this.selectedStopEggs() + (next - current) * row.eggs_per_unit <= (this.delivery()?.remaining_quantity ?? 0);
  }

  adjustStopUnit(row: DeliveryUnitBalanceRow, direction: -1 | 1): void {
    if (direction === 1 && !this.canIncrementStopUnit(row)) return;
    const current = this.selectedUnitAmount(row);
    const available = Number(row.remaining_amount ?? 0);
    const next = direction === 1 ? Math.min(available, current + 1) : Math.max(0, current - 1);
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

  openLoad(): void {
    if (!this.canOperate || this.closePending()) return;
    this.clearFeedback();
    this.reviewing.set(null);
    this.loadForm.controls.production_unit_id.reset();
    this.loadForm.controls.items.clear();
    this.loadForm.controls.items.push(this.loadLine('1', this.defaultUnitId()));
    this.loadOpen.set(true);
  }

  async addLoad(): Promise<void> {
    const delivery = this.delivery();
    if (!this.canOperate || !delivery || this.busy() || this.closePending()) return;
    const payload = this.loadPayload(this.loadForm);
    if (!payload) return;
    await this.persistBusiness('load', { ...payload, occurred_at: this.actionOccurredAt('load') }, this.newId());
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
    if (!this.canOperate || !delivery || !client || this.busy() || this.closePending()) return;
    if (delivery.loaded_quantity === 0 && this.stopMode() === 'delivered') {
      this.error.set('Agregá una carga de huevos antes de registrar entregas.');
      return;
    }

    if (this.stopMode() === 'payment') {
      const payment = this.paymentPayload();
      if (!payment) return;
      const key = this.newId();
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
      this.quantityControl(row).invalid || this.selectedUnitAmount(row) > Number(row.remaining_amount ?? 0)
      || this.selectedUnitAmount(row) > 0 && this.priceControl(row).invalid)) {
      this.error.set('Revisá las cantidades y los precios: usá pesos enteros para cada presentación elegida.');
      return;
    }
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

    const idempotencyKey = this.newId();
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

  private paymentPayload(): { amount: string; payment_method: PaymentMethod; payment_reference?: string; reason?: string } | null {
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

  async retryEntry(entry: DeliveryOutboxEntry): Promise<void> {
    try { await this.outbox.retry(entry); await this.refreshQueue(); await this.flushOutbox(); }
    catch (error) { this.error.set(this.errorMessage(error, 'No se pudo reintentar la operación.')); }
  }

  private isCurrentActor(id: number): boolean { return !this.destroyed && this.auth.user()?.id === id; }

  async openCloseConfirmation(): Promise<void> {
    if (this.busy() || !this.canOperate) return;
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
    this.returnLegacyQuantity.setValue(String(delivery?.remaining_quantity ?? 0));
    this.returnAmounts.clear();
    const rows = (delivery?.unit_balances?.rows ?? []).filter((row) => Number(row.remaining_amount ?? 0) > 0);
    this.returnRows.set(rows);
    for (const row of rows) this.returnAmounts.push(new FormControl(row.remaining_amount ?? '0', { nonNullable: true }));
    const origins = this.returnOrigins();
    this.returnUnit.setValue(origins.length === 1 ? origins[0].id : null);
    this.returnNotes.reset();
    this.closePrepared = true;
  }

  async closeDelivery(): Promise<void> {
    const delivery = this.delivery();
    if (!this.canOperate || !delivery || this.busy() || this.closePending()) return;
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
    if (quantity > delivery.remaining_quantity) { this.error.set('La descarga supera los huevos disponibles.'); return; }
    if (quantity < delivery.remaining_quantity) { this.error.set('La descarga final debe incluir todos los huevos sobrantes.'); return; }
    if (quantity > 0 && !this.returnUnit.value) { this.error.set('Seleccioná la UP donde descargar todos los sobrantes.'); return; }
    if (quantity > 0 && this.returnUnit.value) payload.return_production_unit_id = this.returnUnit.value;
    payload.notes = this.returnNotes.value.trim() || 'Cierre desde modo repartidor';
    const closingOdometer = this.closeOdometer.value.trim().replace(',', '.');
    if (closingOdometer) payload.odometer_km = closingOdometer;
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
    const idempotencyKey = this.newId();
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
    const delivery = this.delivery(); const actorId = this.auth.user()?.id;
    if (!this.canOperate || !delivery || !actorId || !this.online() || this.syncing()) return;
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
        if (this.native && !this.closePending()) await this.startTracking();
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
    const bounds = this.map.getBounds(); const request = ++this.mapRequest; const actorId = this.auth.user()?.id;
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
    if (this.map || !element.isConnected) return;
    const center: L.LatLngExpression = [-34.73, -56.218];
    this.map = L.map(element, { zoomControl: false, attributionControl: true }).setView(center, 13);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).on('tileerror', () => this.mapError.set('El mapa no está disponible. Podés continuar desde Clientes.')).addTo(this.map);
    this.map.on('moveend', () => this.scheduleMap());
    this.scheduleMap();
    this.updateMapMarkers();
    this.fitMapToClients();
    const position = this.lastPosition() ?? this.delivery()?.latest_location;
    if (position) this.updateCurrentMarker(position);
    setTimeout(() => { this.map?.invalidateSize(); this.fitMapToClients(); }, 100);
  }

  private fitMapToClients(): void {
    if (!this.map) return;
    const points = this.clients().filter((client) => client.latitude !== null && client.longitude !== null).map((client) => [Number(client.latitude), Number(client.longitude)] as L.LatLngTuple);
    if (!points.length) return;
    const element = this.map.getContainer();
    const controlsBottom = element.closest('ion-content')?.querySelector('.map-controls')?.getBoundingClientRect().bottom ?? 0;
    const topPadding = Math.min(Math.max(32, controlsBottom - element.getBoundingClientRect().top + 16), Math.max(32, element.clientHeight - 80));
    this.map.fitBounds(points, { paddingTopLeft: [24, topPadding], paddingBottomRight: [24, 24], maxZoom: 15 });
  }

  private updateMapMarkers(): void {
    if (!this.map) return;
    const clients = (this.online() ? this.mapClients() : this.cachedClients()).filter((client) => client.latitude !== null && client.longitude !== null);
    const colors = getComputedStyle(document.documentElement);
    const color = (token: string) => colors.getPropertyValue(`--gam-color-${token}`).trim();
    const visible = new Set(clients.map((client) => client.id));
    for (const [id, marker] of this.markers) {
      if (!visible.has(id)) { marker.remove(); this.markers.delete(id); }
    }
    for (const client of clients) {
      const visited = this.statusFor(client) !== 'pending' || client.visit_status === 'paid' || client.visit_status === 'visited' || client.visit_status === 'delivered';
      const existing = this.markers.get(client.id);
      if (existing) { existing.setStyle({ fillColor: color(visited ? 'success' : 'primary') }); continue; }
      const marker = L.circleMarker([Number(client.latitude), Number(client.longitude)], {
        radius: 11, color: color('surface'), weight: 3, fillColor: color(visited ? 'success' : 'primary'), fillOpacity: 1,
      }).addTo(this.map).bindTooltip(client.name);
      marker.on('click', () => void this.openMapClient(client));
      this.markers.set(client.id, marker);
    }
  }

  private updateCurrentMarker(location: { latitude: number | string; longitude: number | string }): void {
    if (!this.map) return;
    this.currentMarker?.remove();
    this.currentMarker = L.circleMarker([Number(location.latitude), Number(location.longitude)], { radius: 8, color: getComputedStyle(document.documentElement).getPropertyValue('--gam-color-secondary').trim(), fillColor: getComputedStyle(document.documentElement).getPropertyValue('--gam-color-success').trim(), fillOpacity: 0.9 }).addTo(this.map);
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

  private newId(): string {
    return crypto.randomUUID();
  }
}
