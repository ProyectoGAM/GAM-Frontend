import { Component, computed, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { moonOutline, sunnyOutline } from 'ionicons/icons';

import { AuthStore } from '../../core/auth/auth.store';
import { ThemeService } from '../../core/theme/theme.service';
import { AdminSidebarComponent } from './components/admin-sidebar.component';
import { firstVisibleAdminPath, visibleAdminNavigation } from './admin-navigation';

@Component({
  selector: 'app-admin-shell',
  templateUrl: './admin-shell.page.html',
  styleUrl: './admin-shell.page.scss',
  imports: [AdminSidebarComponent, IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, RouterOutlet],
})
export class AdminShellPage {
  readonly auth = inject(AuthStore);
  readonly theme = inject(ThemeService);
  readonly groups = computed(() => visibleAdminNavigation(this.auth.user()));
  readonly firstVisibleRoute = computed(() => firstVisibleAdminPath(this.auth.user()) ?? '/acceso-denegado');
  readonly router = inject(Router);

  constructor() {
    addIcons({ 'moon-outline': moonOutline, 'sunny-outline': sunnyOutline });
    effect(() => {
      if (!this.auth.isAuthenticated()) void this.router.navigateByUrl('/auth');
    });
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }
}
