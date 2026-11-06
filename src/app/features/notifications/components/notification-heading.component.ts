import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline } from 'ionicons/icons';

import { AppNotification } from '../interfaces/notification';

const urgencyLabels = {
  bajo: { level: 1, label: 'Baja' },
  medio: { level: 2, label: 'Media' },
  alto: { level: 3, label: 'Alta' },
} as const;

const moduleLabels = new Map([
  ['general', 'General'],
  ['management_plans', 'Planes de manejo'],
  ['inventory', 'Inventario'],
  ['deliveries', 'Repartos'],
  ['farm_structure', 'Instalaciones'],
  ['flocks', 'Lotes'],
  ['vehicles', 'Vehículos'],
]);

const relativeTime = new Intl.RelativeTimeFormat('es-UY', { style: 'short' });

function formatRecentDate(date: string): string | null {
  const minutes = Math.floor((Date.now() - Date.parse(date)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 1440) return null;
  if (minutes === 0) return 'Ahora';
  return minutes < 60
    ? relativeTime.format(-minutes, 'minute')
    : relativeTime.format(-Math.floor(minutes / 60), 'hour');
}

@Component({
  selector: 'app-notification-heading',
  imports: [DatePipe, IonIcon],
  template: `
    <span class="copy">
      <strong>{{ notification().titulo }}</strong>
      <small>{{ moduleLabel() }} ·
        <time [attr.datetime]="notification().fecha" [attr.title]="notification().fecha | date:'dd/MM/yyyy HH:mm'">
          {{ recentDate() ?? (notification().fecha | date:'dd/MM/yyyy HH:mm') }}
        </time>
      </small>
      @if (notification().estado_resolucion === 'resuelto') {
        <small class="resolution">
          <span><ion-icon name="checkmark-circle-outline" aria-hidden="true" /> Resuelta</span>
          @if (notification().resuelta_en; as resolvedAt) {
            · <time [attr.datetime]="resolvedAt" [attr.title]="resolvedAt | date:'dd/MM/yyyy HH:mm'">
              {{ recentResolution() ?? (resolvedAt | date:'dd/MM/yyyy HH:mm') }}
            </time>
          }
        </small>
      }
    </span>
    @if (urgency(); as item) {
      <span class="urgency" [class]="notification().urgencia" [attr.aria-label]="'Urgencia ' + item.label">
        <span class="level" aria-hidden="true">{{ item.level }}</span> {{ item.label }}
      </span>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; align-items: center; }
    .copy { display: grid; gap: 0.2rem; overflow-wrap: anywhere; }
    strong { color: var(--gam-color-heading); }
    small { color: var(--gam-color-text-muted); font-size: 0.8125rem; }
    .resolution span { color: var(--gam-color-success); font-weight: 700; }
    .resolution ion-icon { vertical-align: text-bottom; font-size: 1rem; }
    .urgency { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; font-weight: 700; }
    .bajo { color: var(--gam-color-primary); }
    .medio { color: var(--gam-color-warning); }
    .alto { color: var(--gam-color-danger); }
    .level { display: inline-grid; place-items: center; inline-size: 1.4rem; block-size: 1.4rem; border: 2px solid currentColor; border-radius: 50%; }
  `,
})
export class NotificationHeadingComponent {
  readonly notification = input.required<AppNotification>();
  readonly urgency = computed(() => urgencyLabels[this.notification().urgencia]);
  readonly recentDate = computed(() => formatRecentDate(this.notification().fecha));
  readonly recentResolution = computed(() => {
    const date = this.notification().resuelta_en;
    return date ? formatRecentDate(date) : null;
  });
  readonly moduleLabel = computed(() => {
    const code = this.notification().modulo;
    return moduleLabels.get(code) ?? (code?.replaceAll('_', ' ') || 'General');
  });

  constructor() {
    addIcons({ 'checkmark-circle-outline': checkmarkCircleOutline });
  }
}
