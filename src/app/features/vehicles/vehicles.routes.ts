import { Routes } from '@angular/router';

export const vehiclesRoutes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/vehicle-list/vehicle-list.page').then((module) => module.VehicleListPage) },
  { path: ':id', loadComponent: () => import('./pages/vehicle-detail/vehicle-detail.page').then((module) => module.VehicleDetailPage) },
];
