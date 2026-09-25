import { Component, DestroyRef, computed, input, output, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  barChartOutline, businessOutline, carOutline, chevronDownOutline, clipboardOutline,
  cubeOutline, eggOutline, locationOutline, notificationsOutline, peopleOutline, personOutline,
  closeOutline, menuOutline,
} from 'ionicons/icons';
import { filter } from 'rxjs';

import { AdminNavigationGroup, activeAdminGroup } from '../admin-navigation';

@Component({
  selector: 'app-admin-sidebar',
  templateUrl: './admin-sidebar.component.html',
  styleUrl: './admin-sidebar.component.scss',
  imports: [IonIcon, RouterLink, RouterLinkActive],
})
export class AdminSidebarComponent {
  readonly groups = input.required<readonly AdminNavigationGroup[]>();
  readonly firstVisibleRoute = input.required<string>();
  readonly isShared = input(false);
  readonly userName = input('');
  readonly roles = input<readonly string[]>([]);
  readonly logoutRequested = output<void>();
  readonly mobileMenuOpen = signal(false);
  readonly expandedGroup = signal(activeAdminGroup(inject(Router).url));
  readonly roleLabel = computed(() => this.roles().join(', '));
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({
      'bar-chart-outline': barChartOutline,
      'business-outline': businessOutline,
      'car-outline': carOutline,
      'chevron-down-outline': chevronDownOutline,
      'clipboard-outline': clipboardOutline,
      'cube-outline': cubeOutline,
      'egg-outline': eggOutline,
      'location-outline': locationOutline,
      'menu-outline': menuOutline,
      'notifications-outline': notificationsOutline,
      'people-outline': peopleOutline,
      'person-outline': personOutline,
      'close-outline': closeOutline,
    });
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((event) => {
      this.expandedGroup.set(activeAdminGroup(event.urlAfterRedirects));
      this.mobileMenuOpen.set(false);
    });
  }

  toggleGroup(groupId: AdminNavigationGroup['id']): void {
    this.expandedGroup.update((current) => current === groupId ? null : groupId);
  }

  isGroupExpanded(groupId: AdminNavigationGroup['id']): boolean {
    return this.expandedGroup() === groupId;
  }
}
