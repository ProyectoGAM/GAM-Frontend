import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { canCreateFlockFromQuickAccess } from '../../core/auth/access-policy';
import { AuthStore } from '../../core/auth/auth.store';
import type { QuickAccessPage } from './pages/quick-access/quick-access.page';

export const quickAccessRoutes: Routes = [
  {
    path: 'nuevo-lote',
    data: { fromQuickAccess: true },
    canActivate: [() => canCreateFlockFromQuickAccess(inject(AuthStore).user())
      || inject(Router).parseUrl('/acceso-denegado')],
    loadComponent: () => import('../flocks/pages/flock-create/flock-create.page').then((module) => module.FlockCreatePage),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/quick-access/quick-access.page').then((module) => module.QuickAccessPage),
    canDeactivate: [(page: QuickAccessPage) => page.canLeave()],
  },
];
