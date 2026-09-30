import { Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { menuOutline, moonOutline, sunnyOutline } from 'ionicons/icons';

import { AuthStore } from '../../core/auth/auth.store';
import { hasDeliveryRole } from '../../core/auth/access-policy';
import { ThemeService } from '../../core/theme/theme.service';
import { AdminSidebarComponent } from './components/admin-sidebar.component';
import { firstVisibleAdminPath, visibleAdminNavigation } from './admin-navigation';
import { AdminUnitContextService } from './services/admin-unit-context.service';

@Component({
  selector: 'app-admin-shell',
  templateUrl: './admin-shell.page.html',
  styleUrl: './admin-shell.page.scss',
  imports: [AdminSidebarComponent, IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, RouterLink, RouterOutlet],
  providers: [AdminUnitContextService],
})
export class AdminShellPage {
  readonly auth = inject(AuthStore);
  readonly hasDeliveryRole = hasDeliveryRole;
  readonly theme = inject(ThemeService);
  readonly unitContext = inject(AdminUnitContextService);
  readonly groups = computed(() => visibleAdminNavigation(this.auth.user()));
  readonly firstVisibleRoute = computed(() => firstVisibleAdminPath(this.auth.user()) ?? '/acceso-denegado');
  readonly router = inject(Router);

  constructor() {
    addIcons({ 'menu-outline': menuOutline, 'moon-outline': moonOutline, 'sunny-outline': sunnyOutline });
    void this.unitContext.load();
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.unitContext.reset();
        void this.router.navigateByUrl('/auth');
      }
    });
  }

  async logout(): Promise<void> {
    this.unitContext.reset();
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }
}
