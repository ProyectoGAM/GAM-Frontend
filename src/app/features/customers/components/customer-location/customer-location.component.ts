import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal, viewChild } from '@angular/core';
import mapboxgl from 'mapbox-gl/esm';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';

import { MAPBOX_ACCESS_TOKEN } from '../../../../core/config/mapbox.config';

@Component({
  selector: 'app-customer-location',
  template: `<div #mapHost class="location-map" aria-label="Seleccionar ubicación del cliente"></div>@if (error()) { <p class="map-feedback" role="status">{{ error() }}</p> }<p class="map-hint">Tocá el mapa o mové el marcador para elegir la ubicación. También podés escribir las coordenadas.</p>`,
  styles: [`:host{display:block}.location-map{height:250px;width:100%;border:1px solid var(--gam-color-border);border-radius:10px;overflow:hidden;background:var(--gam-color-surface-alt)}.map-feedback,.map-hint{color:var(--gam-color-text-muted);font-size:.875rem;line-height:1.5}.map-feedback{color:var(--gam-color-warning)}`],
})
export class CustomerLocationComponent {
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('mapHost');
  private readonly token = inject(MAPBOX_ACCESS_TOKEN, { optional: true }) ?? '';
  private readonly destroyRef = inject(DestroyRef);
  private map: MapboxMap | null = null;
  private marker: MapboxMarker | null = null;
  private resize: ResizeObserver | null = null;
  readonly latitude = input<string | null>(null);
  readonly longitude = input<string | null>(null);
  readonly disabled = input(false);
  readonly pointSelected = output<{ latitude: string; longitude: string }>();
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => { this.latitude(); this.longitude(); this.disabled(); this.updateMarker(); });
    afterNextRender(() => this.initialize());
    this.destroyRef.onDestroy(() => { this.resize?.disconnect(); this.marker?.remove(); this.map?.remove(); });
  }

  private initialize(): void {
    if (!this.token.trim()) { this.error.set('El mapa no está disponible. Podés ingresar las coordenadas para guardar la ubicación.'); return; }
    try {
      this.map = new mapboxgl.Map({ container: this.host().nativeElement, accessToken: this.token,
        style: 'mapbox://styles/mapbox/light-v11', center: [-56.1645, -34.9011], zoom: 9 });
      this.map.on('load', () => { this.error.set(null); this.updateMarker(true); });
      this.map.on('error', () => this.error.set('No se pudo cargar el mapa. Podés seguir usando los campos de ubicación.'));
      this.map.on('click', (event) => { if (!this.disabled()) this.select(event.lngLat.lat, event.lngLat.lng); });
      this.resize = new ResizeObserver(() => this.map?.resize());
      this.resize.observe(this.host().nativeElement);
    } catch {
      this.error.set('No se pudo cargar el mapa. Podés seguir usando los campos de ubicación.');
    }
  }

  private updateMarker(center = false): void {
    const latitude = this.latitude(); const longitude = this.longitude();
    if (!this.map || latitude === null || longitude === null || latitude.trim() === '' || longitude.trim() === '') { this.marker?.remove(); this.marker = null; return; }
    const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    if (!this.marker) {
      const color = getComputedStyle(this.host().nativeElement).getPropertyValue('--gam-color-primary').trim();
      this.marker = new mapboxgl.Marker({ draggable: !this.disabled(), color }).setLngLat([lng, lat]).addTo(this.map);
      this.marker.on('dragend', () => { const point = this.marker?.getLngLat(); if (point && !this.disabled()) this.select(point.lat, point.lng); });
    } else { this.marker.setLngLat([lng, lat]); this.marker.setDraggable(!this.disabled()); }
    if (center) this.map.jumpTo({ center: [lng, lat], zoom: 14 });
  }

  private select(latitude: number, longitude: number): void {
    this.pointSelected.emit({ latitude: latitude.toFixed(7), longitude: longitude.toFixed(7) });
  }
}
