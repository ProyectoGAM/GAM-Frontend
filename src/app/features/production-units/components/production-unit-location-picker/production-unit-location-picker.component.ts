import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, map, of, switchMap, timer } from 'rxjs';
import mapboxgl from 'mapbox-gl';
import type { Map as MapboxMap, MapMouseEvent, Marker as MapboxMarker } from 'mapbox-gl';

import { MAPBOX_ACCESS_TOKEN } from '../../../../core/config/mapbox.config';
import { ProductionUnitLocationValue } from '../../interfaces/production-unit.interface';
import { MapboxPlace, ProductionUnitGeocodingService, ProductionUnitSearchContext } from '../../services/production-unit-geocoding.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { isValidProductionUnitPoint } from '../../types/production-unit-location.type';

type LabelState = 'idle' | 'searching' | 'reverse' | 'ready' | 'not-found' | 'unconfirmed' | 'error';
type SearchRequest = { id: number; query: string; context: ProductionUnitSearchContext };
type SearchOutcome = { id: number; places: MapboxPlace[]; failed: boolean };
type ReverseRequest = { id: number; latitude: number; longitude: number };
type ReverseOutcome = { id: number; place: MapboxPlace | null; failed: boolean };
type LocationCandidate = { id: number; latitude: number; longitude: number; address: string | null; administrativeContext: ProductionUnitLocationValue['administrativeContext']; reverse: boolean };
type ValidationOutcome = { candidate: LocationCandidate; error: unknown | null };

const URUGUAY_CENTER: [number, number] = [-56.1645, -34.9011];
const URUGUAY_BOUNDS: [[number, number], [number, number]] = [[-58.6, -35.2], [-53.0, -30.0]];

@Component({
  selector: 'app-production-unit-location-picker',
  templateUrl: './production-unit-location-picker.component.html',
  styleUrl: './production-unit-location-picker.component.scss',
})
export class ProductionUnitLocationPickerComponent {
  private readonly geocoding = inject(ProductionUnitGeocodingService);
  private readonly units = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accessToken = inject(MAPBOX_ACCESS_TOKEN, { optional: true }) ?? '';
  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('mapHost');
  private readonly searchRequests = new Subject<SearchRequest>();
  private readonly reverseRequests = new Subject<ReverseRequest | null>();
  private readonly validationRequests = new Subject<LocationCandidate | null>();
  private map: MapboxMap | null = null;
  private marker: MapboxMarker | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mapLoadListener: (() => void) | null = null;
  private mapErrorListener: (() => void) | null = null;
  private mapClickListener: ((event: MapMouseEvent) => void) | null = null;
  private markerDragListener: (() => void) | null = null;
  private searchRequestId = 0;
  private reverseRequestId = 0;
  private validationRequestId = 0;
  private initialKey: string | null | undefined;
  private contextKey: string | undefined;

  readonly initialLocation = input<{
    address?: string | null;
    latitude: number | string | null | undefined;
    longitude: number | string | null | undefined;
  } | null>(null);
  readonly context = input<ProductionUnitSearchContext>({});
  readonly readOnly = input(false);
  readonly validationError = input<string | null>(null);
  readonly locationChange = output<ProductionUnitLocationValue | null>();
  readonly validationPending = output<boolean>();

  readonly location = signal<ProductionUnitLocationValue | null>(null);
  readonly addressText = signal('');
  readonly searchQuery = signal('');
  readonly suggestions = signal<MapboxPlace[]>([]);
  readonly isSearching = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly labelState = signal<LabelState>('idle');
  readonly mapReady = signal(false);
  readonly mapError = signal<string | null>(null);
  readonly isValidating = signal(false);
  readonly selectionError = signal<string | null>(null);

  constructor() {
    this.searchRequests.pipe(
      switchMap((request) => {
        if (request.query.length < 3) return of({ id: request.id, places: [], failed: false });
        return timer(350).pipe(
          switchMap(() => this.geocoding.search(request.query, request.context).pipe(
            map((places): SearchOutcome => ({ id: request.id, places, failed: false })),
            catchError(() => of<SearchOutcome>({ id: request.id, places: [], failed: true })),
          )),
        );
      }),
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((outcome) => {
      if (outcome.id !== this.searchRequestId) return;
      this.isSearching.set(false);
      this.suggestions.set(outcome.places);
      this.searchError.set(outcome.failed ? 'No se pudo buscar la dirección. Revisá tu conexión e intentá nuevamente.' : null);
    });

    this.reverseRequests.pipe(
      switchMap((request) => request === null
        ? EMPTY
        : this.geocoding.reverse(request.latitude, request.longitude).pipe(
          map((places): ReverseOutcome => ({ id: request.id, place: places[0] ?? null, failed: false })),
          catchError(() => of<ReverseOutcome>({ id: request.id, place: null, failed: true })),
        )),
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((outcome) => this.applyReverseResult(outcome));

    this.validationRequests.pipe(
      switchMap((candidate) => candidate === null
        ? EMPTY
        : this.units.validateLocation(candidate.latitude, candidate.longitude).pipe(
          map((): ValidationOutcome => ({ candidate, error: null })),
          catchError((error: unknown) => of<ValidationOutcome>({ candidate, error })),
        )),
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((outcome) => this.applyValidationResult(outcome));

    effect(() => {
      const value = this.initialLocation();
      const key = value === null ? null : JSON.stringify(value);
      if (key === this.initialKey) return;
      this.initialKey = key;
      this.applyInitialLocation(value);
    });

    effect(() => {
      const contextKey = this.contextLabel(this.context());
      if (this.contextKey === undefined) {
        this.contextKey = contextKey;
        return;
      }
      if (contextKey === this.contextKey) return;
      this.contextKey = contextKey;
      this.searchRequestId += 1;
      this.searchRequests.next({ id: this.searchRequestId, query: '', context: this.context() });
      this.isSearching.set(false);
      this.suggestions.set([]);
    });

    afterNextRender(() => this.initializeMap());
    this.destroyRef.onDestroy(() => this.destroyMap());
  }

  onAddressInput(value: string | null | undefined): void {
    if (this.readOnly()) return;
    const text = value ?? '';
    this.addressText.set(text);
    this.searchError.set(null);
    this.searchRequestId += 1;
    this.reverseRequestId += 1;
    this.reverseRequests.next(null);
    this.cancelLocationValidation();
    this.suggestions.set([]);

    const query = text.trim();
    this.searchQuery.set(query);
    this.isSearching.set(query.length >= 3);
    this.searchRequests.next({ id: this.searchRequestId, query, context: this.context() });

    const current = this.location();
    if (current) {
      const next = { ...current, address: null, isConfirmed: false };
      this.location.set(next);
      this.locationChange.emit(next);
      this.labelState.set(query ? 'unconfirmed' : 'idle');
    }
  }

  onNativeAddressInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.onAddressInput(event.target.value);
  }

  chooseSuggestion(place: MapboxPlace): void {
    const [longitude, latitude] = place.center;
    if (!isValidProductionUnitPoint(latitude, longitude)) return;
    const address = place.place_name.trim().slice(0, 500);
    this.requestLocationValidation({
      latitude,
      longitude,
      address: address || null,
      administrativeContext: place.administrativeContext ?? null,
      reverse: !address,
    });
  }

  confirmAddressForPoint(): void {
    const current = this.location();
    const address = this.addressText().trim().slice(0, 500);
    if (!current || !isValidProductionUnitPoint(current.latitude, current.longitude) || !address
      || address === this.pointDescription()) return;
    const next = { ...current, address, isConfirmed: true };
    this.location.set(next);
    this.addressText.set(address);
    this.labelState.set('ready');
    this.locationChange.emit(next);
    this.clearSearch();
  }

  canConfirmAddressForPoint(): boolean {
    const current = this.location();
    const address = this.addressText().trim();
    return Boolean(current && isValidProductionUnitPoint(current.latitude, current.longitude)
      && address && address !== this.pointDescription() && !this.isValidating());
  }

  preserveSearchFocus(event: PointerEvent): void {
    event.preventDefault();
  }

  preventSearchSubmit(event: KeyboardEvent): void {
    if (event.key === 'Enter') event.preventDefault();
  }

  private initializeMap(): void {
    const host = this.mapHost()?.nativeElement;
    if (!host) return;
    if (!this.accessToken.trim()) {
      this.mapError.set('El mapa no está disponible porque falta configurar el acceso a Mapbox.');
      return;
    }

    const current = this.location();
    const hasInitialPoint = current !== null
      && isValidProductionUnitPoint(current.latitude, current.longitude);
    const center: [number, number] = hasInitialPoint
      ? [current.longitude as number, current.latitude as number]
      : URUGUAY_CENTER;
    const initialPointOutsideBounds = hasInitialPoint && (
      center[0] < URUGUAY_BOUNDS[0][0] || center[0] > URUGUAY_BOUNDS[1][0]
      || center[1] < URUGUAY_BOUNDS[0][1] || center[1] > URUGUAY_BOUNDS[1][1]
    );

    try {
      mapboxgl.accessToken = this.accessToken;
      this.map = new mapboxgl.Map({
        container: host,
        style: 'mapbox://styles/mapbox/light-v11',
        center,
        zoom: hasInitialPoint ? 14 : 6,
        maxBounds: initialPointOutsideBounds ? undefined : URUGUAY_BOUNDS,
        attributionControl: true,
      });
      this.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    } catch {
      this.mapError.set('No se pudo cargar el mapa. Podés conservar los datos y volver a intentarlo.');
      return;
    }

    this.mapErrorListener = () => this.mapError.set('Mapbox no pudo cargar el mapa. Revisá tu conexión y conservá el punto seleccionado.');
    this.map.on('error', this.mapErrorListener);
    this.mapLoadListener = () => {
      this.mapReady.set(true);
      this.mapError.set(null);
      if (!this.readOnly()) {
        this.mapClickListener = (event) => this.selectMapPoint(event.lngLat.lat, event.lngLat.lng);
        this.map?.on('click', this.mapClickListener);
      }
      this.syncMarker();
      this.map?.resize();
    };
    this.map.on('load', this.mapLoadListener);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.map?.resize());
      this.resizeObserver.observe(host);
    }
  }

  private applyInitialLocation(value: {
    address?: string | null;
    latitude: number | string | null | undefined;
    longitude: number | string | null | undefined;
  } | null): void {
    this.cancelSearchAndReverse();
    const latitude = value?.latitude == null ? NaN : Number(value.latitude);
    const longitude = value?.longitude == null ? NaN : Number(value.longitude);
    if (!value || !isValidProductionUnitPoint(latitude, longitude)) {
      this.location.set(null);
      this.addressText.set('');
      this.searchQuery.set('');
      this.labelState.set('idle');
      this.syncMarker();
      return;
    }

    const address = value.address?.trim().slice(0, 500) || null;
    const next: ProductionUnitLocationValue = { address, latitude, longitude, isConfirmed: true };
    this.location.set(next);
    this.addressText.set(address ?? '');
    this.labelState.set(address ? 'ready' : 'reverse');
    this.syncMarker();
    if (!address) this.reverseGeocode(latitude, longitude);
  }

  private selectMapPoint(latitude: number, longitude: number): void {
    if (this.readOnly() || !isValidProductionUnitPoint(latitude, longitude)) return;
    this.requestLocationValidation({ latitude, longitude, address: null, administrativeContext: null, reverse: true });
  }

  private requestLocationValidation(candidate: Omit<LocationCandidate, 'id'>): void {
    const id = ++this.validationRequestId;
    this.cancelSearchAndReverse();
    this.searchError.set(null);
    this.selectionError.set(null);
    this.isValidating.set(true);
    this.validationRequests.next({ ...candidate, id });
    this.validationPending.emit(true);
  }

  private applyValidationResult(outcome: ValidationOutcome): void {
    if (outcome.candidate.id !== this.validationRequestId) return;
    this.isValidating.set(false);
    this.validationPending.emit(false);
    if (outcome.error !== null) {
      const status = typeof outcome.error === 'object' && outcome.error !== null && 'status' in outcome.error
        ? (outcome.error as { status?: unknown }).status
        : null;
      this.selectionError.set(status === 422
        ? 'El punto queda fuera del territorio habilitado. Elegí otra ubicación en el mapa.'
        : 'No se pudo validar este punto. La ubicación anterior se conservó; revisá la conexión e intentá nuevamente.');
      this.syncMarker();
      return;
    }

    const candidate = outcome.candidate;
    const address = candidate.address?.trim().slice(0, 500) || null;
    const next: ProductionUnitLocationValue = {
      address,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      isConfirmed: Boolean(address),
      administrativeContext: candidate.administrativeContext ?? null,
    };
    this.location.set(next);
    this.addressText.set(address ?? this.pointDescription());
    this.labelState.set(address ? 'ready' : 'reverse');
    this.searchError.set(null);
    this.searchQuery.set('');
    this.clearSearch();
    this.locationChange.emit(next);
    this.moveMapTo(candidate.longitude, candidate.latitude, candidate.reverse ? 14 : 15);
    this.syncMarker();
    if (candidate.reverse) this.reverseGeocode(candidate.latitude, candidate.longitude);
  }

  private cancelLocationValidation(emitState = true): void {
    this.validationRequestId += 1;
    this.validationRequests.next(null);
    this.isValidating.set(false);
    if (emitState) this.validationPending.emit(false);
  }

  private reverseGeocode(latitude: number, longitude: number): void {
    const id = ++this.reverseRequestId;
    this.reverseRequests.next({ id, latitude, longitude });
  }

  private applyReverseResult(outcome: ReverseOutcome): void {
    if (outcome.id !== this.reverseRequestId) return;
    const current = this.location();
    if (!current) return;
    if (outcome.place?.place_name.trim() && (outcome.place.place_type?.includes('address') ?? true)) {
      const address = outcome.place.place_name.trim().slice(0, 500);
      const next = { ...current, address, isConfirmed: true, administrativeContext: outcome.place.administrativeContext ?? null };
      this.location.set(next);
      this.addressText.set(address);
      this.labelState.set('ready');
      this.locationChange.emit(next);
      return;
    }
    this.labelState.set(outcome.failed ? 'error' : 'not-found');
    if (outcome.place?.administrativeContext && !current.administrativeContext) {
      const next = { ...current, administrativeContext: outcome.place.administrativeContext };
      this.location.set(next);
      this.locationChange.emit(next);
    }
    if (!current.address) this.addressText.set(this.pointDescription());
    if (outcome.failed) this.searchError.set('No se pudo obtener la dirección del punto. La ubicación sigue seleccionada; podés completar la dirección.');
  }

  private syncMarker(): void {
    if (!this.mapReady() || !this.map) return;
    const current = this.location();
    if (!current || !isValidProductionUnitPoint(current.latitude, current.longitude)) {
      this.marker?.remove();
      this.marker = null;
      return;
    }
    const latitude = current.latitude;
    const longitude = current.longitude;
    if (latitude === null || longitude === null) return;
    const coordinates: [number, number] = [longitude, latitude];
    if (!this.marker) {
      this.marker = new mapboxgl.Marker({ element: this.createMarkerElement(), draggable: !this.readOnly() })
        .setLngLat(coordinates)
        .addTo(this.map);
      if (!this.readOnly()) {
        this.markerDragListener = () => {
          const point = this.marker?.getLngLat();
          if (point) this.selectMapPoint(point.lat, point.lng);
        };
        this.marker.on('dragend', this.markerDragListener);
      }
      return;
    }
    this.marker.setLngLat(coordinates);
  }

  private moveMapTo(longitude: number, latitude: number, zoom: number): void {
    if (this.mapReady()) this.map?.flyTo({ center: [longitude, latitude], zoom, essential: true });
  }

  private createMarkerElement(): HTMLElement {
    const element = document.createElement('div');
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', this.readOnly() ? 'Ubicación guardada' : 'Marcador de ubicación arrastrable');
    element.style.width = '24px';
    element.style.height = '24px';
    element.style.border = '3px solid var(--gam-color-surface)';
    element.style.borderRadius = '50%';
    element.style.backgroundColor = 'var(--gam-color-primary)';
    element.style.boxShadow = '0 1px 4px color-mix(in srgb, var(--gam-color-heading) 35%, transparent)';
    element.style.cursor = this.readOnly() ? 'default' : 'grab';
    return element;
  }

  private clearSearch(): void {
    this.searchRequestId += 1;
    this.isSearching.set(false);
    this.suggestions.set([]);
    this.searchQuery.set('');
    this.searchError.set(null);
    this.searchRequests.next({ id: this.searchRequestId, query: '', context: this.context() });
  }

  private cancelSearchAndReverse(): void {
    this.searchRequestId += 1;
    this.reverseRequestId += 1;
    this.searchRequests.next({ id: this.searchRequestId, query: '', context: this.context() });
    this.reverseRequests.next(null);
    this.isSearching.set(false);
    this.suggestions.set([]);
    this.searchQuery.set('');
  }

  private contextLabel(context: ProductionUnitSearchContext): string {
    return `${context.locality ?? ''}|${context.department ?? ''}`;
  }

  private pointDescription(): string {
    return 'Punto seleccionado en el mapa';
  }

  private destroyMap(): void {
    this.cancelSearchAndReverse();
    this.cancelLocationValidation(false);
    this.resizeObserver?.disconnect();
    if (this.map && this.mapClickListener) this.map.off('click', this.mapClickListener);
    if (this.map && this.mapLoadListener) this.map.off('load', this.mapLoadListener);
    if (this.map && this.mapErrorListener) this.map.off('error', this.mapErrorListener);
    if (this.marker && this.markerDragListener) this.marker.off('dragend', this.markerDragListener);
    this.map?.remove();
    this.map = null;
    this.marker = null;
    this.mapErrorListener = null;
  }
}
