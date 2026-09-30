import { Routes } from '@angular/router';

export const deliveryRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./delivery.page').then((module) => module.DeliveryPage),
  },
];
