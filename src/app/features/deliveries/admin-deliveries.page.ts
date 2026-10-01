import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonSpinner, IonText } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { locationOutline, refreshOutline } from 'ionicons/icons';

import { DeliveriesApi } from './deliveries.api';
import { Delivery } from './delivery.models';

@Component({
  selector: 'app-admin-deliveries',
  templateUrl: './admin-deliveries.page.html',
  styleUrl: './admin-deliveries.page.scss',
  imports: [DatePipe, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonSpinner, IonText],
})
export class AdminDeliveriesPage implements AfterViewInit, OnDestroy {
  @ViewChild('adminMap') private readonly mapElement?: ElementRef<HTMLDivElement>;

  private readonly api = inject(DeliveriesApi);
  readonly active = signal<Delivery[]>([]);
  readonly history = signal<Delivery[]>([]);
  readonly selected = signal<Delivery | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly timer = setInterval(() => void this.load(), 15_000);
  private map: L.Map | null = null;
  private markers: L.Marker[] = [];

  constructor() {
    addIcons({ locationOutline, refreshOutline });
  }

  async ngAfterViewInit(): Promise<void> {
    this.initializeMap();
    await this.load();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.map?.remove();
  }

  async select(delivery: Delivery): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.detail(delivery.id));
      this.selected.set(response.data);
      this.updateMap(response.data);
    } catch {
      this.error.set('No se pudo cargar el detalle del reparto.');
    }
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [current, all] = await Promise.all([
        firstValueFrom(this.api.current()),
        firstValueFrom(this.api.list({ per_page: 50 })),
      ]);
      this.active.set(current.data);
      this.history.set(all.data.filter((delivery) => delivery.status !== 'active'));
      const selected = this.selected();
      if (selected) {
        const refreshed = all.data.find((delivery) => delivery.id === selected.id) ?? current.data.find((delivery) => delivery.id === selected.id);
        if (refreshed) await this.select(refreshed);
      } else if (current.data[0]) {
        await this.select(current.data[0]);
      }
    } catch {
      this.error.set('No se pudo cargar la información de repartos.');
    } finally {
      this.loading.set(false);
    }
  }

  private initializeMap(): void {
    const element = this.mapElement?.nativeElement;
    if (!element) return;
    this.map = L.map(element, { zoomControl: false }).setView([-34.86, -56.13], 11);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(this.map);
  }

  private updateMap(delivery: Delivery): void {
    if (!this.map) return;
    for (const marker of this.markers) marker.remove();
    this.markers = [];
    const location = delivery.latest_location;
    if (location) {
      const marker = L.marker([Number(location.latitude), Number(location.longitude)]).addTo(this.map).bindTooltip(delivery.driver?.name ?? 'Repartidor');
      this.markers.push(marker);
      this.map.setView([Number(location.latitude), Number(location.longitude)], 13);
    }
  }
}
