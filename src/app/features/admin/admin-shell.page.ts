import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { AuthStore } from '../../core/auth/auth.store';
import { firstVisibleAdminPath, visibleAdminNavigation } from './admin-navigation';

@Component({
  selector: 'app-admin-shell',
  templateUrl: './admin-shell.page.html',
  styleUrl: './admin-shell.page.scss',
  imports: [IonButton, IonContent, IonHeader, IonTitle, IonToolbar, RouterLink, RouterLinkActive, RouterOutlet],
})
export class AdminShellPage {
  readonly auth = inject(AuthStore);
  readonly groups = computed(() => visibleAdminNavigation(this.auth.user()));
  readonly firstVisibleRoute = computed(() => firstVisibleAdminPath(this.auth.user()) ?? '/acceso-denegado');
  readonly router = inject(Router);
  readonly mobileMenuOpen = signal(false);

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) void this.router.navigateByUrl('/auth');
    });
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }
}
