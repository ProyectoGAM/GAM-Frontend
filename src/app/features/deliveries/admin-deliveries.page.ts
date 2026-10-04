import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonSpinner, IonText } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';
import mapboxgl from 'mapbox-gl';
import type { LngLatBounds, Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { EMPTY, Subject, catchError, distinctUntilChanged, finalize, forkJoin, interval, map, merge, of, switchMap, tap } from 'rxjs';

import { MAPBOX_ACCESS_TOKEN } from '../../core/config/mapbox.config';
import { AdminUnitContextService } from '../admin/services/admin-unit-context.service';
import { Delivery } from './delivery.models';
import { DeliveriesApi } from './deliveries.api';

type MapPoint = { coordinates: [number, number]; label: string; kind: 'unit' | 'stop' | 'latest' };
const URUGUAY_CENTER: [number, number] = [-56.1645, -34.9011];

@Component({
  selector: 'app-admin-deliveries',
  templateUrl: './admin-deliveries.page.html',
  styleUrl: './admin-deliveries.page.scss',
  imports: [DatePipe, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonSpinner, IonText],
})
export class AdminDeliveriesPage {
  private readonly api = inject(DeliveriesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accessToken = inject(MAPBOX_ACCESS_TOKEN, { optional: true }) ?? '';
  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('adminMap');
  private readonly refreshRequests = new Subject<void>();
  private readonly selectedDeliveryRequests = new Subject<Delivery | null>();
  private readonly unitSelectionRequests = new Subject<number | null>();
  private map: MapboxMap | null = null;
  private mapLoadListener: (() => void) | null = null;
  private mapErrorListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private markers: MapboxMarker[] = [];

  readonly unitContext = inject(AdminUnitContextService);
  readonly active = signal<Delivery[]>([]);
  readonly history = signal<Delivery[]>([]);
  readonly selected = signal<Delivery | null>(null);
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
        return this.api.detail(delivery.id).pipe(
          map((response) => response.data),
          catchError(() => {
            this.detailError.set('No se pudo cargar el detalle del reparto.');
            return of(delivery);
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
      switchMap((unitId) => merge(of(void 0), interval(15_000), this.refreshRequests).pipe(
        tap(() => { this.loading.set(true); this.error.set(null); }),
        switchMap(() => forkJoin({
          current: this.api.current(unitId === null ? {} : { production_unit_id: unitId }),
          all: this.api.list({ per_page: 50, ...(unitId === null ? {} : { production_unit_id: unitId }) }),
        }).pipe(
          tap(({ current, all }) => {
            this.active.set(current.data);
            this.history.set(all.data.filter((delivery) => delivery.status !== 'active'));
            const currentSelectionId = this.selected()?.id;
            const refreshed = currentSelectionId === undefined ? undefined
              : [...current.data, ...all.data].find((delivery) => delivery.id === currentSelectionId);
            const next = refreshed ?? (!currentSelectionId ? current.data[0] : undefined);
            if (next) this.select(next);
            else this.selectedDeliveryRequests.next(null);
            this.loading.set(false);
          }),
          catchError(() => {
            this.error.set('No se pudo cargar la información de repartos. Revisá tu conexión e intentá nuevamente.');
            this.loading.set(false);
            return EMPTY;
          }),
        )),
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
    this.selected.set(delivery);
    this.updateMap(delivery);
    this.selectedDeliveryRequests.next(delivery);
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
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', point.label);
      element.title = point.label;
      this.markers.push(new mapboxgl.Marker({ element, anchor: 'center' }).setLngLat(point.coordinates).addTo(this.map));
    }
    if (points.length === 1) this.map.easeTo({ center: points[0].coordinates, zoom: 13 });
    else this.map.fitBounds(bounds, { padding: 56, maxZoom: 13, duration: 350 });
  }

  private mapPoints(delivery: Delivery): MapPoint[] {
    const points: MapPoint[] = [];
    const unit = delivery.production_unit;
    const unitPoint = unit ? this.point(unit.latitude, unit.longitude) : null;
    if (unit && unitPoint) points.push({ coordinates: unitPoint, label: `Unidad productiva: ${unit.name}`, kind: 'unit' });
    for (const stop of delivery.stops ?? []) {
      const point = this.point(stop.latitude, stop.longitude);
      if (point) points.push({ coordinates: point, label: `Visita: ${stop.client_name}`, kind: 'stop' });
    }
    const latest = delivery.latest_location;
    const latestPoint = latest ? this.point(latest.latitude, latest.longitude) : null;
    if (latest && latestPoint) points.push({ coordinates: latestPoint, label: `Última ubicación registrada: ${latest.captured_at}`, kind: 'latest' });
    return points;
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
  }
}
