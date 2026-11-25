import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router, Routes } from '@angular/router';

const redirectLinkedDelivery: CanActivateFn = (route) => {
  const id = route.queryParamMap.get('reparto')?.trim();
  if (!id) return true;
  const queryParams = { ...route.queryParams, reparto: null };
  return new RedirectCommand(inject(Router).createUrlTree(['/administracion/repartos/repartos', id], { queryParams }), { replaceUrl: true });
};

export const adminDeliveriesRoutes: Routes = [
  {
    path: '', pathMatch: 'full', canActivate: [redirectLinkedDelivery], runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    loadComponent: () => import('./admin-deliveries.page').then((module) => module.AdminDeliveriesPage),
  },
  { path: ':id', data: { title: 'Detalle del reparto' }, loadComponent: () => import('./admin-delivery-detail.page').then((module) => module.AdminDeliveryDetailPage) },
];
