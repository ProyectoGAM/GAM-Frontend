import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { hasManagementPlansPermission } from '../../core/auth/access-policy';
import { HealthCatalogKind } from './types/health-catalog.type';
import type { CatalogCreatePage } from './pages/catalog-create/catalog-create.page';

const adminOnly: CanActivateFn = () => inject(AuthStore).isAdmin() || inject(Router).parseUrl('/acceso-denegado');
const catalogReader: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.isAdmin() || hasManagementPlansPermission(auth.user(), 'manage')
    || inject(Router).parseUrl('/acceso-denegado');
};
function routes(kind: HealthCatalogKind): Routes {
  return [
    { path: '', pathMatch: 'full', canActivate: [catalogReader], data: { catalogKind: kind },
      loadComponent: () => import('./pages/catalog-list/catalog-list.page').then((module) => module.CatalogListPage) },
    { path: 'nuevo', canActivate: [adminOnly], data: { catalogKind: kind },
      canDeactivate: [(page: CatalogCreatePage) => page.canLeave()],
      loadComponent: () => import('./pages/catalog-create/catalog-create.page').then((module) => module.CatalogCreatePage) },
    ...(kind === 'vaccines' ? [{
      path: ':id', canActivate: [catalogReader], data: { catalogKind: kind },
      loadComponent: () => import('./pages/vaccine-detail/vaccine-detail.page').then((module) => module.VaccineDetailPage),
    }] : []),
  ];
}
export const vaccinationRoutes = routes('vaccines');
export const medicationRoutes = routes('medicines');
