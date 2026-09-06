import { Routes } from '@angular/router';

import { adminGuard } from '../../core/guards/admin.guard';
import { authGuard } from '../../core/guards/auth.guard';

export const adminRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./admin.page').then((m) => m.AdminPage),
  },
];
