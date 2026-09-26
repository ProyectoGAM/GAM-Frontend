import { Routes } from '@angular/router';

import { authGuard } from '../../core/guards/auth.guard';
import { adminGroupGuard } from '../../core/guards/admin-group.guard';
import { adminPanelGuard } from '../../core/guards/admin-panel.guard';
import { ADMIN_NAVIGATION } from './admin-navigation';
import { adminIndexRedirect } from './admin-index.redirect';

const moduleRoutes: Routes = ADMIN_NAVIGATION.map((group) => ({
  path: group.id,
  canActivate: [authGuard, adminGroupGuard],
  data: { group: group.id },
  children:
    group.id === 'inventario'
      ? [
          {
            path: '',
            loadChildren: () =>
              import('../inventory/inventory.routes').then(
                (module) => module.inventoryRoutes,
              ),
          },
        ]
      : group.items.map((item) => {
          if (
            group.id === 'ubicaciones' &&
            item.slug === 'unidades-productivas'
          ) {
            return {
              path: item.slug,
              data: { title: item.label, groupLabel: group.label },
              loadChildren: () =>
                import('../production-units/production-units.routes').then(
                  (module) => module.productionUnitsRoutes,
                ),
            };
          }

          if (
            group.id === 'ubicaciones' &&
            item.slug === 'nueva-unidad-productiva'
          ) {
            return {
              path: item.slug,
              data: { title: item.label, groupLabel: group.label },
              loadChildren: () =>
                import('../production-units/production-units.routes').then(
                  (module) => module.productionUnitCreateRoutes,
                ),
            };
          }

          if (
            group.id === 'ubicaciones' &&
            item.slug === 'galpones'
          ) {
            return {
              path: item.slug,
              data: { title: item.label, groupLabel: group.label },
              loadChildren: () =>
                import('../production-units/production-units.routes').then(
                  (module) => module.poultryHousesListRoutes,
                ),
            };
          }

          if (group.id === 'ubicaciones' && item.slug === 'plantas-de-racion') {
            return {
              path: item.slug,
              data: { title: item.label, groupLabel: group.label },
              loadChildren: () => import('../production-units/production-units.routes')
                .then((module) => module.feedPlantsListRoutes),
            };
          }

          if (group.id === 'ubicaciones' && item.slug === 'nuevo-galpon') {
            return {
              path: item.slug,
              data: { title: item.label, groupLabel: group.label },
              loadChildren: () => import('../production-units/production-units.routes')
                .then((module) => module.poultryHouseCreateRoutes),
            };
          }

          return {
            path: item.slug,
            data: { title: item.label, groupLabel: group.label },
            loadComponent: () =>
              import('./admin-placeholder.page').then(
                (module) => module.AdminPlaceholderPage,
              ),
          };
        }),
}));

export const adminRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, adminPanelGuard],
    loadComponent: () =>
      import('./admin-shell.page').then((module) => module.AdminShellPage),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: adminIndexRedirect,
      },
      ...moduleRoutes,
    ],
  },
];
