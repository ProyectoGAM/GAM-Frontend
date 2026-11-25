import { formatDeliveryMoney } from './delivery-money';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, afterRenderEffect, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DeliveryStopCorrectionComponent } from './components/delivery-stop-correction.component';
import { DeliveryFinancialSummaryComponent } from './components/delivery-financial-summary.component';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, chevronDownOutline, closeOutline, expandOutline, mapOutline } from 'ionicons/icons';
import mapboxgl from 'mapbox-gl/esm';
import type { GeoJSONSource, Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { EMPTY, Subject, catchError, distinctUntilChanged, filter, finalize, interval, map, merge, of, switchMap, tap } from 'rxjs';

import { MAPBOX_ACCESS_TOKEN, mapboxWorkerUrl } from '../../core/config/mapbox.config';
import { AuthStore } from '../../core/auth/auth.store';
import { hasAnyPermission } from '../../core/auth/permission-keys';
import { ThemeService } from '../../core/theme/theme.service';
import { formatUyuMoney, parseUyuAmount, uyuDecimal } from '../../shared/utils/uyu-money';
import type { CustomerMovement } from '../customers/interfaces/customer';
import { formatFuelLiters } from '../vehicles/vehicle-format';
import { Delivery, DeliveryStop } from './delivery.models';
import { DeliveriesApi } from './deliveries.api';

type MapPoint = {
  id: string;
  coordinates: [number, number];
  sequence: number;
  title: string;
  details: string[];
  occurredAt: string | null;
  kind: DeliveryTimelineEvent['kind'] | 'location';
};
type DeliveryTimelineEvent = {
  id: string;
  occurredAt: string | null;
  recordedAt: string | null;
  title: string;
  details: string[];
  kind: 'start' | 'load' | 'visit' | 'charge' | 'payment' | 'fuel' | 'close';
  priority: number;
};
type DetailTab = 'visits' | 'stock' | 'payments' | 'vehicle';
const URUGUAY_CENTER: [number, number] = [-56.1645, -34.9011];
const LOCATION_MATCH_WINDOW_MS = 10 * 60 * 1000;
const VISIT_LINE_SOURCE = 'delivery-visit-sequence';
const VISIT_LINE_HALO = 'delivery-visit-sequence-halo';

@Component({
  selector: 'app-admin-delivery-detail',
  templateUrl: './admin-delivery-detail.page.html',
  styleUrl: './admin-delivery-detail.page.scss',
  imports: [DeliveryFinancialSummaryComponent, DeliveryStopCorrectionComponent, DatePipe, IonIcon, IonSpinner, RouterLink],
})
export class AdminDeliveryDetailPage {
  readonly money = formatDeliveryMoney;
  readonly currency = formatUyuMoney;
  readonly fuelLiters = formatFuelLiters;
  private readonly auth = inject(AuthStore);
  private readonly api = inject(DeliveriesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly theme = inject(ThemeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accessToken = inject(MAPBOX_ACCESS_TOKEN, { optional: true }) ?? '';
  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('adminMap');
  private readonly inlineMap = viewChild.required<ElementRef<HTMLElement>>('inlineMap');
  private readonly mapViewport = viewChild.required<ElementRef<HTMLDivElement>>('mapViewport');
  private readonly mapDialog = viewChild<ElementRef<HTMLDialogElement>>('mapDialog');
  private readonly mapTrigger = viewChild<ElementRef<HTMLButtonElement>>('mapTrigger');
  private readonly refreshRequests = new Subject<void>();
  private map: MapboxMap | null = null;
  private mapLoadListener: (() => void) | null = null;
  private mapErrorListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly markers = new Map<string, MapboxMarker>();
  private mapPointsSignature: string | null = null;
  private mapFitDeliveryId: string | null = null;

  readonly selected = signal<Delivery | null>(null);
  readonly tab = signal<DetailTab>('visits');
  readonly selectedVisit = signal<number | null>(null);
  readonly expandedVisit = signal<number | null>(null);
  readonly editingStop = signal<number | null>(null);
  readonly correctionMessage = signal('');
  readonly canViewCustomers = computed(() => this.auth.isAdmin()
    || hasAnyPermission(this.auth.user()?.permissions, 'can_view_customers'));
  readonly canRectify = computed(() => {
    const delivery = this.selected();
    return !!delivery && delivery.status !== 'cancelled' && delivery.remaining_quantity < 0
      && this.auth.isAdmin() && this.auth.status() === 'personal_authenticated';
  });
  readonly timeline = computed(() => {
    const delivery = this.selected();
    return delivery ? this.buildTimeline(delivery) : [];
  });
  readonly visits = computed(() => {
    const delivery = this.selected();
    const stops = new Map((delivery?.stops ?? []).map((stop) => [`visit-${stop.id}`, stop]));
    let nextVisitNumber = 1;
    return this.timeline().filter((event) => event.kind === 'visit').flatMap((event) => {
      const stop = stops.get(event.id);
      if (!stop) return [];
      const number = stop.status === 'pending' ? null : nextVisitNumber++;
      return [{ stop, event, number, collected: this.visitCollected(stop, delivery?.account_movements ?? []) }];
    });
  });
  readonly selectedMapPoints = computed(() => {
    const delivery = this.selected();
    return delivery ? this.mapPoints(delivery) : [];
  });
  readonly visitCoordinates = computed(() => this.selectedMapPoints()
    .filter((point) => point.kind === 'visit')
    .map((point) => point.coordinates)
    .filter((point, index, points) => index === 0 || !this.samePoint(point, points[index - 1])));
  readonly detailLoading = signal(true);
  readonly detailError = signal<string | null>(null);
  readonly mapReady = signal(false);
  readonly mapError = signal<string | null>(null);
  readonly hasMapPoints = computed(() => this.selectedMapPoints().length > 0);

  constructor() {
    addIcons({ arrowBackOutline, chevronDownOutline, closeOutline, expandOutline, mapOutline });
    afterNextRender(() => {
      this.initializeMap();
      void this.mapHost()?.nativeElement.closest<HTMLIonContentElement>('ion-content')?.scrollToTop(0);
    });
    this.destroyRef.onDestroy(() => this.destroyMap());
    afterRenderEffect(() => this.updateMap());
    effect(() => {
      this.theme.isDarkMode();
      if (this.mapReady()) this.updateLineColors();
    });
    effect(() => {
      const visitId = this.selectedVisit();
      for (const [id, marker] of this.markers) this.styleMarker(marker.getElement(), id === `visit-${visitId}`);
    });

    this.route.paramMap.pipe(
      map((params) => params.get('id')),
      distinctUntilChanged(),
      tap(() => {
        const dialog = this.mapDialog()?.nativeElement;
        if (dialog?.open) dialog.close();
        this.selected.set(null);
        this.tab.set('visits');
        this.selectedVisit.set(null);
        this.expandedVisit.set(null);
        this.editingStop.set(null);
        this.correctionMessage.set('');
        this.detailError.set(null);
      }),
      switchMap((id) => id === null ? EMPTY : merge(
        of(false),
        this.refreshRequests.pipe(map(() => false)),
        interval(30_000).pipe(map(() => true)),
      ).pipe(
        filter((background) => !background || (!this.detailLoading() && this.selected()?.status === 'active' && this.editingStop() === null)),
        switchMap((background) => this.loadDetail(id, background)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ data }) => this.selected.set(data));
  }

  load(): void {
    this.refreshRequests.next();
  }

  private loadDetail(id: string, background: boolean) {
    if (!background) {
      this.detailLoading.set(true);
      this.detailError.set(null);
    }
    return this.api.detail(id).pipe(
      catchError(() => {
        if (!background) this.detailError.set('No se pudo cargar el detalle del reparto. Intentá nuevamente.');
        return EMPTY;
      }),
      finalize(() => { if (!background) this.detailLoading.set(false); }),
    );
  }

  refreshCorrection(deliveryId: string, message: string): void {
    if (this.selected()?.id !== deliveryId) return;
    this.editingStop.set(null);
    this.correctionMessage.set(message);
    this.load();
  }

  showVisit(stop: DeliveryStop): void {
    this.expandedVisit.update((id) => id === stop.id ? null : stop.id);
    this.focusVisit(stop);
  }

  focusVisit(stop: DeliveryStop): void {
    this.selectedVisit.set(stop.id);
    const point = this.selectedMapPoints().find((item) => item.id === `visit-${stop.id}`);
    if (point && this.mapReady()) this.map?.easeTo({ center: point.coordinates, duration: 250 });
  }

  editVisit(stop: DeliveryStop): void {
    this.editingStop.set(stop.id);
    this.correctionMessage.set('');
    this.focusVisit(stop);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('app-delivery-stop-correction h4')?.focus(), { injector: this.injector });
  }

  cancelEdit(stop: DeliveryStop): void {
    this.editingStop.set(null);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`#edit-visit-${stop.id}`)?.focus(), { injector: this.injector });
  }

  private visitCollected(stop: DeliveryStop, deliveryMovements: CustomerMovement[]): string | null {
    if (stop.accounting_status === 'legacy_unreconciled') return null;
    const movements = new Map((stop.account_movements ?? []).map((movement) => [movement.id, movement]));
    for (const movement of deliveryMovements) {
      if (movement.delivery_stop_id === stop.id) movements.set(movement.id, movement);
    }
    let collected = 0n;
    let known = stop.accounting_status === 'posted';
    for (const movement of movements.values()) {
      if (movement.type !== 'payment' && !(movement.type === 'reversal' && movement.payment_method)) continue;
      const amount = parseUyuAmount(movement.amount);
      if (amount === null) continue;
      known = true;
      collected -= amount;
    }
    return known ? uyuDecimal(collected) : null;
  }

  hasRecordedDelay(event: DeliveryTimelineEvent): boolean {
    if (!event.occurredAt || !event.recordedAt) return false;
    const difference = Math.abs(Date.parse(event.recordedAt) - Date.parse(event.occurredAt));
    return Number.isFinite(difference) && difference >= 1000;
  }

  private buildTimeline(delivery: Delivery): DeliveryTimelineEvent[] {
    const events: DeliveryTimelineEvent[] = [];
    const push = (event: DeliveryTimelineEvent): void => { events.push(event); };
    const initialLoad = (delivery.loads ?? []).find((load) => load.type === 'initial');
    const startDetails = [
      `Repartidor: ${delivery.driver?.name ?? 'Sin repartidor'}`,
      ...(delivery.vehicle ? [`Vehículo: ${delivery.vehicle.plate} · ${delivery.vehicle.make} ${delivery.vehicle.model}`] : delivery.vehicle_reference ? [`Vehículo: ${delivery.vehicle_reference}`] : []),
      ...(delivery.vehicle_usage?.start_odometer_km ? [`Kilometraje de salida: ${delivery.vehicle_usage.start_odometer_km} km`] : []),
      delivery.started_without_load
        ? 'Inicio sin carga de huevos'
        : `Carga inicial: ${initialLoad?.quantity ?? delivery.loaded_quantity} huevos · ${initialLoad?.production_unit?.name ?? delivery.production_unit?.name ?? 'UP sin identificar'}`,
    ];
    push({ id: 'start', occurredAt: delivery.started_at, recordedAt: null, title: 'Reparto iniciado', details: startDetails, kind: 'start', priority: 0 });

    for (const load of delivery.loads ?? []) {
      const breakdown = (load.items ?? []).map((item) => `${item.amount} ${item.label} (${item.eggs} huevos)`).join(', ');
      push({
        id: `load-${load.id}`,
        occurredAt: load.occurred_at ?? load.created_at ?? null,
        recordedAt: load.created_at ?? null,
        title: load.type === 'initial' ? 'Carga inicial registrada' : 'Carga adicional registrada',
        details: [
          `${load.quantity} huevos · ${load.production_unit?.name ?? delivery.production_unit?.name ?? 'UP sin identificar'}`,
          ...(breakdown ? [`Presentaciones: ${breakdown}`] : []),
        ],
        kind: 'load',
        priority: load.type === 'initial' ? 1 : 1 + load.id / 1_000_000,
      });
    }

    const groupedMovementIds = new Set<string>();
    for (const stop of delivery.stops ?? []) {
      const delivered = stop.status === 'delivered';
      const items = (stop.items ?? []).map((item) => `${item.amount} ${item.label}${item.unit_price !== undefined ? ` a ${this.money(item.unit_price)} c/u` : ''}`).join(', ');
      const movementsById = new Map<string, CustomerMovement>();
      for (const movement of stop.account_movements ?? []) movementsById.set(movement.id, movement);
      for (const movement of delivery.account_movements ?? []) {
        if (movement.delivery_stop_id === stop.id) movementsById.set(movement.id, movement);
      }
      const movements = [...movementsById.values()].sort((left, right) => left.sequence - right.sequence);
      for (const movement of movements) groupedMovementIds.add(movement.id);
      const chargeMovements = movements.filter((movement) => movement.type === 'sale_charge');
      const lastMovement = movements.at(-1);
      const chargeTotal = chargeMovements.reduce((total, movement) => total + Math.abs(Number(movement.amount)), 0);
      const hasCharge = chargeMovements.length > 0 || stop.total_amount !== null && stop.total_amount !== undefined;
      const chargeAmount = chargeMovements.length > 0 ? chargeTotal : stop.total_amount;
      const accountingDetails = [
        ...(hasCharge ? [`Cargo: ${this.money(chargeAmount)}`] : []),
        ...(lastMovement ? [`Saldo final del cliente: ${this.money(lastMovement.balance_after)}`] : []),
      ];
      const details = [
        ...(delivered && items ? [`Presentaciones: ${items} -- ${stop.delivered_quantity} huevos en total`] : delivered ? [`${stop.delivered_quantity} huevos en total`] : []),
        ...(!delivered && stop.visit_reason ? [`Motivo: ${stop.visit_reason}`] : []),
        ...(stop.notes ? [`Nota: ${stop.notes}`] : []),
        ...accountingDetails,
      ];
      const recordedAt = [stop.created_at, ...movements.map((movement) => movement.created_at)]
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(left) - Date.parse(right))
        .at(-1) ?? null;
      push({
        id: `visit-${stop.id}`,
        occurredAt: stop.visited_at ?? stop.created_at ?? null,
        recordedAt,
        title: delivered ? `Entrega · ${stop.client_name}` : stop.status === 'not_delivered' ? `Visita sin entrega · ${stop.client_name}` : `Visita pendiente · ${stop.client_name}`,
        details,
        kind: 'visit',
        priority: 2 + stop.sequence / 100_000,
      });
    }

    const movements = new Map<string, CustomerMovement>();
    for (const movement of delivery.account_movements ?? []) movements.set(movement.id, movement);
    for (const stop of delivery.stops ?? []) {
      for (const movement of stop.account_movements ?? []) movements.set(movement.id, movement);
    }
    for (const movement of movements.values()) {
      if (groupedMovementIds.has(movement.id)) continue;
      const isPayment = movement.type === 'payment';
      push({
        id: `movement-${movement.id}`,
        occurredAt: movement.occurred_at,
        recordedAt: movement.created_at,
        title: this.movementTitle(movement),
        details: this.movementDetails(movement),
        kind: isPayment ? 'payment' : 'charge',
        priority: 3 + movement.sequence / 1_000_000,
      });
    }

    for (const fuel of delivery.vehicle_usage?.fuel_entries ?? []) {
      push({
        id: `fuel-${fuel.id}`,
        occurredAt: fuel.occurred_at,
        recordedAt: null,
        title: `Combustible registrado · ${fuel.fuel_type}`,
        details: [
          `${formatFuelLiters(fuel.liters)} l · ${this.money(fuel.amount)}`,
          ...(fuel.supplier ? [`Proveedor: ${fuel.supplier}`] : []),
          ...(fuel.odometer_km ? [`Odómetro: ${fuel.odometer_km} km`] : []),
          ...(fuel.notes ? [`Nota: ${fuel.notes}`] : []),
        ],
        kind: 'fuel',
        priority: 4 + Date.parse(fuel.occurred_at) / 1_000_000_000_000,
      });
    }

    if (delivery.closed_at || delivery.status !== 'active') {
      const returnedItems = (delivery.returned_items ?? []).map((item) => `${item.amount} ${item.label} (${item.eggs} huevos)`).join(', ');
      push({
        id: 'close',
        occurredAt: delivery.closed_at,
        recordedAt: null,
        title: delivery.status === 'completed' ? 'Reparto finalizado' : 'Reparto cancelado',
        details: [
          `Descarga final: ${delivery.returned_quantity} huevos · ${delivery.return_production_unit?.name ?? 'sin descarga'}`,
          ...(delivery.vehicle_usage?.end_odometer_km ? [`Kilometraje de cierre: ${delivery.vehicle_usage.end_odometer_km} km${delivery.vehicle_usage.distance_km ? ` · Recorrido de tablero: ${delivery.vehicle_usage.distance_km} km` : ''}`] : []),
          ...(returnedItems ? [`Presentaciones devueltas: ${returnedItems}`] : []),
          ...(delivery.close_notes ? [`Observaciones: ${delivery.close_notes}`] : []),
        ],
        kind: 'close',
        priority: 9,
      });
    }

    return events.sort((left, right) => {
      const leftTime = left.occurredAt ?? left.recordedAt;
      const rightTime = right.occurredAt ?? right.recordedAt;
      const leftValue = leftTime ? Date.parse(leftTime) : Number.POSITIVE_INFINITY;
      const rightValue = rightTime ? Date.parse(rightTime) : Number.POSITIVE_INFINITY;
      const timeDifference = (Number.isFinite(leftValue) ? leftValue : Number.POSITIVE_INFINITY)
        - (Number.isFinite(rightValue) ? rightValue : Number.POSITIVE_INFINITY);
      return timeDifference || left.priority - right.priority || left.id.localeCompare(right.id);
    });
  }

  private movementTitle(movement: CustomerMovement): string {
    return movement.type === 'payment'
      ? `Cobro registrado · ${movement.customer_name}`
      : movement.type === 'sale_charge' ? `Cargo por mercadería · ${movement.customer_name}`
        : movement.type === 'adjustment_increase' ? `Ajuste de deuda · ${movement.customer_name}`
          : movement.type === 'adjustment_decrease' ? `Ajuste a favor · ${movement.customer_name}`
            : `Reversa de movimiento · ${movement.customer_name}`;
  }

  private movementDetails(movement: CustomerMovement): string[] {
    const isPayment = movement.type === 'payment';
    const amount = this.money(Math.abs(Number(movement.amount)).toFixed(3));
    const method = movement.payment_method === 'cash' ? 'Efectivo'
      : movement.payment_method === 'transfer' ? 'Transferencia'
        : movement.payment_method === 'other' ? 'Otro medio' : null;
    const action = isPayment ? 'Cobro' : movement.type === 'sale_charge' ? 'Cargo por mercadería' : this.movementTitle(movement).split(' · ')[0];
    return [
      `${action}: ${amount}${method ? ` · ${method}` : ''}`,
      ...(movement.payment_reference ? [`Referencia: ${movement.payment_reference}`] : []),
      ...(movement.actor?.name ? [`Registrado por: ${movement.actor.name}`] : []),
      `Saldo: ${this.money(movement.balance_before)} → ${this.money(movement.balance_after)}`,
      ...(movement.reason ? [`Motivo: ${movement.reason}`] : []),
    ];
  }

  private initializeMap(): void {
    const host = this.mapHost()?.nativeElement;
    if (!host) return;
    if (!this.accessToken.trim()) {
      this.mapError.set('El mapa no está disponible porque falta configurar el acceso a Mapbox.');
      return;
    }
    try {
      mapboxgl.accessToken = this.accessToken;
      mapboxgl.workerUrl = mapboxWorkerUrl();
      this.map = new mapboxgl.Map({
        container: host,
        style: 'mapbox://styles/mapbox/light-v11',
        center: URUGUAY_CENTER,
        zoom: 5,
        attributionControl: true,
      });
      this.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    } catch {
      this.mapError.set('No se pudo cargar el mapa. Revisá tu conexión e intentá nuevamente.');
      return;
    }
    this.mapErrorListener = () => this.mapError.set('Mapbox no pudo cargar el mapa. La información del reparto sigue disponible.');
    this.map.on('error', this.mapErrorListener);
    this.mapLoadListener = () => {
      this.initializeVisitLine();
      this.mapReady.set(true);
      this.mapError.set(null);
      this.map?.resize();
    };
    this.map.on('load', this.mapLoadListener);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.map?.resize());
      this.resizeObserver.observe(host);
    }
  }

  fitRoute(coordinates = this.visitCoordinates().length ? this.visitCoordinates() : this.selectedMapPoints().map((point) => point.coordinates)): void {
    if (!this.mapReady() || !this.map || !coordinates.length) return;
    if (coordinates.every((point) => this.samePoint(point, coordinates[0]))) {
      this.map.easeTo({ center: coordinates[0], zoom: 13, duration: 350 });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    for (const point of coordinates) bounds.extend(point);
    this.map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 350 });
  }

  openMap(): void {
    const dialog = this.mapDialog()?.nativeElement;
    if (!this.selected() || !dialog || dialog.open) return;
    dialog.append(this.mapViewport().nativeElement);
    dialog.showModal();
    this.map?.resize();
  }

  restoreMap(): void {
    if (this.mapDialog()?.nativeElement.open) return;
    this.inlineMap().nativeElement.append(this.mapViewport().nativeElement);
    this.map?.resize();
    this.mapTrigger()?.nativeElement.focus({ preventScroll: true });
  }

  private initializeVisitLine(): void {
    if (!this.map) return;
    this.map.addSource(VISIT_LINE_SOURCE, { type: 'geojson', data: this.visitLine() });
    this.map.addLayer({
      id: VISIT_LINE_HALO, type: 'line', source: VISIT_LINE_SOURCE,
      layout: { 'line-join': 'round' }, paint: { 'line-width': 7, 'line-opacity': 0.9 },
    });
    this.map.addLayer({
      id: VISIT_LINE_SOURCE, type: 'line', source: VISIT_LINE_SOURCE,
      layout: { 'line-join': 'round' }, paint: { 'line-width': 3, 'line-dasharray': [2.5, 1.5] },
    });
    this.updateLineColors();
  }

  private visitLine(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
    const coordinates = this.visitCoordinates();
    return {
      type: 'FeatureCollection',
      features: coordinates.length < 2 ? [] : [{
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates },
      }],
    };
  }

  private updateLineColors(): void {
    const host = this.mapHost()?.nativeElement;
    if (!host || !this.map) return;
    const style = getComputedStyle(host);
    const stroke = style.getPropertyValue('--gam-color-primary').trim();
    const halo = style.getPropertyValue('--gam-color-surface').trim();
    if (stroke) this.map.setPaintProperty(VISIT_LINE_SOURCE, 'line-color', stroke);
    if (halo) this.map.setPaintProperty(VISIT_LINE_HALO, 'line-color', halo);
  }

  private updateMap(): void {
    if (!this.mapReady() || !this.map) return;
    const points = this.selectedMapPoints();
    const selectedDeliveryId = this.selected()?.id ?? null;
    const selectionChanged = this.mapFitDeliveryId !== selectedDeliveryId;
    const signature = JSON.stringify([selectedDeliveryId, points]);
    if (signature === this.mapPointsSignature) return;
    this.mapPointsSignature = signature;
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    this.map.getSource<GeoJSONSource>(VISIT_LINE_SOURCE)?.setData(this.visitLine());
    if (!points.length) {
      this.map.easeTo({ center: URUGUAY_CENTER, zoom: 5 });
      this.mapFitDeliveryId = null;
      return;
    }
    for (const point of points) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `delivery-map-marker ${point.kind}`;
      const labels = { start: 'I', load: 'C', charge: '$', payment: '$', fuel: 'F', close: '✓', location: '•' };
      element.textContent = point.kind === 'visit' ? String(point.sequence) : labels[point.kind];
      element.setAttribute('aria-label', point.kind === 'visit' ? `${point.sequence}. ${point.title}` : point.title);
      element.title = point.title;
      if (point.kind === 'visit') {
        const visitId = Number(point.id.slice('visit-'.length));
        this.styleMarker(element, this.selectedVisit() === visitId);
        element.addEventListener('click', () => {
          this.tab.set('visits');
          this.selectedVisit.set(visitId);
          this.expandedVisit.set(visitId);
        });
      }
      const markerPopup = new mapboxgl.Popup({ anchor: 'bottom', offset: 18, closeButton: true, className: 'delivery-action-popup-shell', maxWidth: '300px' })
        .setDOMContent(this.popupContent(point));
      this.markers.set(point.id, new mapboxgl.Marker({ element, anchor: 'center' })
        .setLngLat(point.coordinates)
        .setPopup(markerPopup)
        .addTo(this.map));
    }
    if (selectionChanged) {
      this.map.resize();
      this.fitRoute(points.map((point) => point.coordinates));
    }
    this.mapFitDeliveryId = selectedDeliveryId;
  }

  private styleMarker(element: HTMLElement, selected: boolean): void {
    element.classList.toggle('selected', selected);
    if (element.classList.contains('visit')) element.setAttribute('aria-current', String(selected));
  }

  private mapPoints(delivery: Delivery): MapPoint[] {
    const points: MapPoint[] = [];
    const visits = new Map(this.visits().map(({ event, stop, number }) => [event.id, { stop, number }]));
    for (const event of this.timeline()) {
      const visit = visits.get(event.id);
      if (visit?.stop.status === 'pending') continue;
      if (event.kind === 'load') {
        const load = delivery.loads?.find((item) => `load-${item.id}` === event.id);
        if (load?.type === 'initial') continue;
      }
      const coordinates = this.actionCoordinates(delivery, event);
      if (coordinates) {
        points.push({
          id: event.id,
          coordinates,
          sequence: visit?.number ?? 0,
          title: event.title,
          details: event.details,
          occurredAt: event.occurredAt ?? event.recordedAt,
          kind: event.kind,
        });
      }
    }

    const latest = delivery.latest_location;
    const latestPoint = latest ? this.point(latest.latitude, latest.longitude) : null;
    if (latest && latestPoint && !points.some((point) => this.samePoint(point.coordinates, latestPoint))) {
      points.push({
        id: 'latest-location',
        coordinates: latestPoint,
        sequence: 0,
        title: 'Última ubicación registrada',
        details: [`Registrada ${this.mapTime(latest.captured_at)}`],
        occurredAt: latest.captured_at,
        kind: 'location',
      });
    }

    points.sort((left, right) => {
      const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : Number.POSITIVE_INFINITY;
      return (Number.isFinite(leftTime) ? leftTime : Number.POSITIVE_INFINITY)
        - (Number.isFinite(rightTime) ? rightTime : Number.POSITIVE_INFINITY);
    });
    return points;
  }

  private actionCoordinates(delivery: Delivery, event: DeliveryTimelineEvent): [number, number] | null {
    if (event.kind === 'start') {
      const origin = delivery.production_unit ? this.point(delivery.production_unit.latitude, delivery.production_unit.longitude) : null;
      return origin ?? this.nearestLocation(delivery, event.occurredAt);
    }
    if (event.kind === 'load') {
      const load = delivery.loads?.find((item) => `load-${item.id}` === event.id);
      const unit = load?.production_unit;
      const loadPoint = unit ? this.point(unit.latitude, unit.longitude) : null;
      if (loadPoint) return loadPoint;
      const origin = unit?.id === delivery.production_unit?.id && delivery.production_unit
        ? this.point(delivery.production_unit.latitude, delivery.production_unit.longitude)
        : null;
      return origin ?? this.nearestLocation(delivery, event.occurredAt);
    }
    if (event.kind === 'visit') {
      const stop = delivery.stops?.find((item) => `visit-${item.id}` === event.id);
      return stop ? this.point(stop.latitude, stop.longitude) : null;
    }
    if (event.kind === 'payment' || event.kind === 'charge') {
      const movementId = event.id.slice('movement-'.length);
      const movement = [...(delivery.account_movements ?? []), ...(delivery.stops ?? []).flatMap((stop) => stop.account_movements ?? [])]
        .find((item) => item.id === movementId);
      const stop = movement?.delivery_stop_id === null || movement?.delivery_stop_id === undefined
        ? undefined : delivery.stops?.find((item) => item.id === movement.delivery_stop_id);
      return stop ? this.point(stop.latitude, stop.longitude) : this.nearestLocation(delivery, event.occurredAt);
    }
    if (event.kind === 'close') {
      const returnUnit = delivery.return_production_unit;
      const returnPoint = returnUnit ? this.point(returnUnit.latitude, returnUnit.longitude) : null;
      return returnPoint ?? this.nearestLocation(delivery, event.occurredAt);
    }
    return this.nearestLocation(delivery, event.occurredAt);
  }

  private nearestLocation(delivery: Delivery, occurredAt: string | null): [number, number] | null {
    if (!occurredAt) return null;
    const eventTime = Date.parse(occurredAt);
    if (!Number.isFinite(eventTime)) return null;
    const savedLocations = [...(delivery.locations ?? [])];
    if (delivery.latest_location && !savedLocations.some((location) => location.id === delivery.latest_location?.id)) {
      savedLocations.push(delivery.latest_location);
    }
    let closest: { location: NonNullable<Delivery['latest_location']>; difference: number } | null = null;
    for (const location of savedLocations) {
      const difference = Math.abs(Date.parse(location.captured_at) - eventTime);
      if (!Number.isFinite(difference) || difference > LOCATION_MATCH_WINDOW_MS) continue;
      if (!closest || difference < closest.difference) closest = { location, difference };
    }
    return closest ? this.point(closest.location.latitude, closest.location.longitude) : null;
  }

  private popupContent(point: MapPoint): HTMLElement {
    const content = document.createElement('article');
    content.className = 'delivery-action-popup';
    const heading = document.createElement('strong');
    heading.textContent = point.kind === 'visit' ? `${point.sequence}. ${point.title}` : point.title;
    content.append(heading);
    const occurredAt = document.createElement('time');
    occurredAt.textContent = this.mapTime(point.occurredAt);
    content.append(occurredAt);
    for (const detail of point.details) {
      const paragraph = document.createElement('p');
      paragraph.textContent = detail;
      content.append(paragraph);
    }
    return content;
  }

  private mapTime(value: string | null): string {
    if (!value) return 'Hora no registrada';
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? new Intl.DateTimeFormat('es-UY', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp)
      : value;
  }

  private samePoint(left: [number, number], right: [number, number]): boolean {
    return left[0] === right[0] && left[1] === right[1];
  }

  private point(latitude: unknown, longitude: unknown): [number, number] | null {
    if ((typeof latitude !== 'number' && (typeof latitude !== 'string' || !latitude.trim()))
      || (typeof longitude !== 'number' && (typeof longitude !== 'string' || !longitude.trim()))) return null;
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return [lon, lat];
  }

  private destroyMap(): void {
    this.resizeObserver?.disconnect();
    if (this.map && this.mapLoadListener) this.map.off('load', this.mapLoadListener);
    if (this.map && this.mapErrorListener) this.map.off('error', this.mapErrorListener);
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    this.map?.remove();
    this.map = null;
    this.mapErrorListener = null;
    this.mapPointsSignature = null;
    this.mapFitDeliveryId = null;
  }
}
