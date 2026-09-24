import { Component, computed, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { AuthStore } from '../../core/auth/auth.store';
import { AdminSidebarComponent } from './components/admin-sidebar.component';
import { firstVisibleAdminPath, visibleAdminNavigation } from './admin-navigation';

@Component({
  selector: 'app-admin-shell',
  templateUrl: './admin-shell.page.html',
  styleUrl: './admin-shell.page.scss',
  imports: [AdminSidebarComponent, IonButton, IonContent, IonHeader, IonTitle, IonToolbar, RouterOutlet],
})
export class AdminShellPage {
  readonly auth = inject(AuthStore);
  readonly groups = computed(() => visibleAdminNavigation(this.auth.user()));
  readonly firstVisibleRoute = computed(() => firstVisibleAdminPath(this.auth.user()) ?? '/acceso-denegado');
  readonly router = inject(Router);

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
