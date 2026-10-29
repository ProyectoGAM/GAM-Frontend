import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { deliveryGuard } from './core/guards/delivery.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: 'home',
    pathMatch: 'full',
    redirectTo: 'administracion',
  },
  {
    path: 'administracion',
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: 'repartidor',
    canActivate: [deliveryGuard],
    loadChildren: () => import('./features/deliveries/delivery.routes').then((m) => m.deliveryRoutes),
  },
  {
    path: 'gestion-accesos',
    pathMatch: 'full',
    redirectTo: 'administracion/usuarios',
  },
  {
    path: 'acceso-denegado',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/access-denied.page').then((m) => m.AccessDeniedPage),
  },
  {
    path: '',
    redirectTo: 'auth',
    pathMatch: 'full',
  },
];
