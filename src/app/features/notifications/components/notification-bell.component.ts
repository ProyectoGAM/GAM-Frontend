import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { notificationsOutline } from 'ionicons/icons';

import { NotificationInboxService } from '../services/notification-inbox.service';

@Component({
  selector: 'app-notification-bell',
  imports: [IonIcon, RouterLink],
  template: `
    <a routerLink="/notificaciones" [attr.aria-label]="'Notificaciones. Sin leer: ' + unread()">
      <ion-icon name="notifications-outline" aria-hidden="true" />
      @if (unread() > 0) {
        <span aria-hidden="true">{{ unread() > 99 ? '99+' : unread() }}</span>
      }
    </a>
  `,
  styles: `
    a {
      position: relative;
      display: inline-grid;
      place-items: center;
      inline-size: 2.75rem;
      block-size: 2.75rem;
      color: var(--gam-color-primary);
      border-radius: 0.5rem;
    }
    a:focus-visible { outline: 2px solid var(--gam-color-focus); }
    ion-icon { font-size: 1.4rem; }
    span {
      position: absolute;
      inset-block-start: 0;
      inset-inline-end: 0;
      padding-inline: 0.25rem;
      border-radius: 1rem;
      background: var(--gam-color-primary);
      color: var(--gam-color-on-primary);
      font-size: 0.75rem;
      line-height: 1rem;
      font-weight: 600;
    }
  `,
})
export class NotificationBellComponent {
  readonly unread = inject(NotificationInboxService).unreadCount;

  constructor() {
    addIcons({ 'notifications-outline': notificationsOutline });
  }
}
