import { formatDeliveryMoney } from './delivery-money';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DeliveryFinancialSummaryComponent } from './components/delivery-financial-summary.component';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonSpinner, IonText } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';
import mapboxgl from 'mapbox-gl/esm';
import type { LngLatBounds, Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { EMPTY, Subject, catchError, distinctUntilChanged, finalize, forkJoin, interval, map, merge, of, switchMap, tap } from 'rxjs';

import { MAPBOX_ACCESS_TOKEN } from '../../core/config/mapbox.config';
import { AdminUnitContextService } from '../admin/services/admin-unit-context.service';
import type { CustomerMovement } from '../customers/interfaces/customer';
import { formatFuelLiters } from '../vehicles/vehicle-format';
import { Delivery } from './delivery.models';
import { DeliveriesApi } from './deliveries.api';

type MapPoint = {
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
const URUGUAY_CENTER: [number, number] = [-56.1645, -34.9011];
const LOCATION_MATCH_WINDOW_MS = 10 * 60 * 1000;

@Component({
  selector: 'app-admin-deliveries',
  templateUrl: './admin-deliveries.page.html',
  styleUrl: './admin-deliveries.page.scss',
  imports: [DeliveryFinancialSummaryComponent, DatePipe, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonSpinner, IonText],
})
export class AdminDeliveriesPage {
  readonly money = formatDeliveryMoney;
  private readonly api = inject(DeliveriesApi);
  private readonly sourceId = inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap.get('reparto');
  private readonly destroyRef = inject(DestroyRef);
  private readonly accessToken = inject(MAPBOX_ACCESS_TOKEN, { optional: true }) ?? '';
  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('adminMap');
  private readonly refreshRequests = new Subject<void>();
  private readonly selectedDeliveryRequests = new Subject<Delivery | string | null>();
  private readonly unitSelectionRequests = new Subject<number | null>();
  private map: MapboxMap | null = null;
  private mapLoadListener: (() => void) | null = null;
  private mapErrorListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private markers: MapboxMarker[] = [];
  private mapPointsSignature: string | null = null;
  private mapFitDeliveryId: string | null = null;

  readonly unitContext = inject(AdminUnitContextService);
  readonly active = signal<Delivery[]>([]);
  readonly history = signal<Delivery[]>([]);
  readonly selected = signal<Delivery | null>(null);
  readonly timeline = computed(() => {
    const delivery = this.selected();
    return delivery ? this.buildTimeline(delivery) : [];
  });
  readonly loading = signal(true);
  readonly detailLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly detailError = signal<string | null>(null);
  readonly mapReady = signal(false);
  readonly mapError = signal<string | null>(null);
  readonly hasMapPoints = signal(false);

  constructor() {
    addIcons({ refreshOutline });
    afterNextRender(() => this.initializeMap());
    this.destroyRef.onDestroy(() => this.destroyMap());

    this.selectedDeliveryRequests.pipe(
      switchMap((delivery) => {
        this.detailError.set(null);
        if (!delivery) {
          this.detailLoading.set(false);
          return of(null);
        }
        this.detailLoading.set(true);
        return this.api.detail(typeof delivery === 'string' ? delivery : delivery.id).pipe(
          map((response) => response.data),
          catchError(() => {
            this.detailError.set('No se pudo cargar el detalle del reparto.');
            const selected = this.selected();
            return of(typeof delivery === 'string'
              ? selected?.id === delivery ? selected : null
              : delivery);
          }),
          finalize(() => this.detailLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((delivery) => {
      this.selected.set(delivery);
      this.updateMap(delivery);
    });

    this.unitSelectionRequests.pipe(
      distinctUntilChanged(),
      tap(() => {
        this.selectedDeliveryRequests.next(null);
        this.active.set([]);
        this.history.set([]);
      }),
      switchMap((unitId) => merge(
        of('full' as const),
        this.refreshRequests.pipe(map(() => 'full' as const)),
        interval(30_000).pipe(map(() => 'active' as const)),
      ).pipe(
        tap((mode) => {
          if (mode === 'full') {
            this.loading.set(true);
            this.error.set(null);
          }
        }),
        switchMap((mode) => {
          const filters = unitId === null ? {} : { production_unit_id: unitId };
          if (mode === 'active') {
            return this.api.current(filters).pipe(
              tap(({ data }) => {
                this.active.set(data);
                this.error.set(null);
                const selected = this.selected();
                if (selected?.status === 'active') this.selectedDeliveryRequests.next(selected.id);
              }),
              catchError(() => EMPTY),
            );
          }

          return forkJoin({
            current: this.api.current(filters),
            all: this.api.list({ per_page: 50, ...filters }),
          }).pipe(
            tap(({ current, all }) => {
              this.active.set(current.data);
              this.history.set(all.data.filter((delivery) => delivery.status !== 'active'));
              const currentSelectionId = this.selected()?.id;
              const source = this.sourceId ? [...current.data, ...all.data].find((delivery) => delivery.id === this.sourceId) : undefined;
              if (currentSelectionId) this.selectedDeliveryRequests.next(currentSelectionId);
              else if (source) this.selectedDeliveryRequests.next(source.id);
              else if (current.data[0]) this.select(current.data[0]);
              else if (this.sourceId) this.selectedDeliveryRequests.next(this.sourceId);
              else this.selectedDeliveryRequests.next(null);
              this.loading.set(false);
            }),
            catchError(() => {
              this.error.set('No se pudo cargar la información de repartos. Revisá tu conexión e intentá nuevamente.');
              this.loading.set(false);
              return EMPTY;
            }),
          );
        }),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
    this.unitSelectionRequests.next(this.unitContext.selectedId());
    effect(() => this.unitSelectionRequests.next(this.unitContext.selectedId()));
  }

  load(): void {
    this.refreshRequests.next();
  }

  select(delivery: Delivery): void {
    if (this.selected()?.id !== delivery.id) {
      this.selected.set(delivery);
      this.updateMap(delivery);
    }
    this.selectedDeliveryRequests.next(delivery.id);
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
      this.map = new mapboxgl.Map({
        container: host,
        style: 'mapbox://styles/mapbox/light-v11',
        center: URUGUAY_CENTER,
        zoom: 5,
        attributionControl: true,
      });
      this.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    } catch {
      this.mapError.set('No se pudo cargar el mapa. Revisá tu conexión; la lista de repartos sigue disponible.');
      return;
    }
    this.mapErrorListener = () => this.mapError.set('Mapbox no pudo cargar el mapa. La información del reparto sigue disponible.');
    this.map.on('error', this.mapErrorListener);
    this.mapLoadListener = () => {
      this.mapReady.set(true);
      this.mapError.set(null);
      this.updateMap(this.selected());
      this.map?.resize();
    };
    this.map.on('load', this.mapLoadListener);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.map?.resize());
      this.resizeObserver.observe(host);
    }
  }

  private updateMap(delivery: Delivery | null): void {
    const points = delivery ? this.mapPoints(delivery) : [];
    this.hasMapPoints.set(points.length > 0);
    if (!this.mapReady() || !this.map) return;
    const selectedDeliveryId = delivery?.id ?? null;
    const selectionChanged = this.mapFitDeliveryId !== selectedDeliveryId;
    const signature = JSON.stringify([selectedDeliveryId, points]);
    if (signature === this.mapPointsSignature) return;
    this.mapPointsSignature = signature;
    for (const marker of this.markers) marker.remove();
    this.markers = [];
    if (!points.length) {
      this.map.easeTo({ center: URUGUAY_CENTER, zoom: 5 });
      return;
    }
    const bounds: LngLatBounds = new mapboxgl.LngLatBounds();
    for (const point of points) {
      bounds.extend(point.coordinates);
      const element = document.createElement('div');
      element.className = `delivery-map-marker ${point.kind}`;
      element.textContent = String(point.sequence);
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', `${point.sequence}. ${point.title}`);
      element.title = `${point.sequence}. ${point.title}`;
      const markerPopup = new mapboxgl.Popup({ anchor: 'bottom', offset: 18, closeButton: true, className: 'delivery-action-popup-shell', maxWidth: '300px' })
        .setDOMContent(this.popupContent(point));
      this.markers.push(new mapboxgl.Marker({ element, anchor: 'bottom' })
        .setLngLat(point.coordinates)
        .setPopup(markerPopup)
        .addTo(this.map));
    }
    if (selectionChanged && points.length === 1) this.map.easeTo({ center: points[0].coordinates, zoom: 13 });
    else if (selectionChanged) this.map.fitBounds(bounds, { padding: 56, maxZoom: 13, duration: 350 });
    this.mapFitDeliveryId = selectedDeliveryId;
  }

  private mapPoints(delivery: Delivery): MapPoint[] {
    const points: MapPoint[] = [];
    for (const event of this.buildTimeline(delivery)) {
      if (event.kind === 'load') {
        const load = delivery.loads?.find((item) => `load-${item.id}` === event.id);
        if (load?.type === 'initial') continue;
      }
      const coordinates = this.actionCoordinates(delivery, event);
      if (coordinates) {
        points.push({
          coordinates,
          sequence: 0,
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
    return points.map((point, index) => ({ ...point, sequence: index + 1 }));
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
    heading.textContent = `${point.sequence}. ${point.title}`;
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
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return [lon, lat];
  }

  private destroyMap(): void {
    this.resizeObserver?.disconnect();
    if (this.map && this.mapLoadListener) this.map.off('load', this.mapLoadListener);
    if (this.map && this.mapErrorListener) this.map.off('error', this.mapErrorListener);
    for (const marker of this.markers) marker.remove();
    this.markers = [];
    this.map?.remove();
    this.map = null;
    this.mapErrorListener = null;
    this.mapPointsSignature = null;
    this.mapFitDeliveryId = null;
  }
}
