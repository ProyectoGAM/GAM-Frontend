import { Routes } from '@angular/router';

import { authGuard } from '../../core/guards/auth.guard';
import { adminGroupGuard } from '../../core/guards/admin-group.guard';
import { adminPanelGuard } from '../../core/guards/admin-panel.guard';
import { adminIndexRedirect } from './admin-index.redirect';
import { ADMIN_NAVIGATION } from './admin-navigation';

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
      : group.id === 'unidades-productivas'
        ? [
            {
              path: '',
              loadChildren: () =>
                import(
                  '../production-units/production-units.routes'
                ).then(
                  (module) => module.productionUnitManagementRoutes,
                ),
            },
          ]
        : group.id === 'resumen' || group.id === 'historial'
          ? [
              {
                path: '',
                data: {
                  title: group.label,
                  groupLabel: group.label,
                },
                loadComponent: () =>
                  import('./admin-placeholder.page').then(
                    (module) => module.AdminPlaceholderPage,
                  ),
              },
            ]
          : [
              ...(group.id === 'ubicaciones'
                ? [
                    {
                      path: 'unidades-productivas',
                      loadChildren: () =>
                        import(
                          '../production-units/production-units.routes'
                        ).then(
                          (module) => module.productionUnitsRoutes,
                        ),
                    },
                    {
                      path: 'nueva-unidad-productiva',
                      loadChildren: () =>
                        import(
                          '../production-units/production-units.routes'
                        ).then(
                          (module) => module.productionUnitCreateRoutes,
                        ),
                    },
                  ]
                : []),

              ...group.items
                .filter((item) => !item.slug.includes('/'))
                .map((item) => {
                  if (
                    group.id === 'ubicaciones' &&
                    item.slug === 'galpones'
                  ) {
                    return {
                      path: item.slug,
                      data: {
                        title: item.label,
                        groupLabel: group.label,
                      },
                      loadChildren: () =>
                        import(
                          '../production-units/production-units.routes'
                        ).then(
                          (module) => module.poultryHousesListRoutes,
                        ),
                    };
                  }

                  if (
                    group.id === 'ubicaciones' &&
                    item.slug === 'plantas-de-racion'
                  ) {
                    return {
                      path: item.slug,
                      data: {
                        title: item.label,
                        groupLabel: group.label,
                      },
                      loadChildren: () =>
                        import(
                          '../production-units/production-units.routes'
                        ).then(
                          (module) => module.feedPlantsListRoutes,
                        ),
                    };
                  }

                  if (
                    group.id === 'ubicaciones' &&
                    item.slug === 'nuevo-galpon'
                  ) {
                    return {
                      path: item.slug,
                      data: {
                        title: item.label,
                        groupLabel: group.label,
                      },
                      loadChildren: () =>
                        import(
                          '../production-units/production-units.routes'
                        ).then(
                          (module) => module.poultryHouseCreateRoutes,
                        ),
                    };
                  }

                  if (
                    group.id === 'proveedores' &&
                    item.slug === 'proveedores'
                  ) {
                    return {
                      path: item.slug,
                      data: {
                        title: item.label,
                        groupLabel: group.label,
                      },
                      loadChildren: () =>
                        import(
                          '../suppliers-catalogs/suppliers/suppliers.routes'
                        ).then(
                          (module) => module.suppliersRoutes,
                        ),
                    };
                  }

                  if (
                    group.id === 'proveedores' &&
                    item.slug === 'productos'
                  ) {
                    return {
                      path: item.slug,
                      data: {
                        title: item.label,
                        groupLabel: group.label,
                      },
                      loadChildren: () =>
                        import(
                          '../suppliers-catalogs/products/products.routes'
                        ).then(
                          (module) => module.productsRoutes,
                        ),
                    };
                  }

                  if (group.id === 'manejo-lotes' && item.slug === 'planes') {
                    return {
                      path: 'planes',
                      loadChildren: () => import('../management-plans/management-plans.routes').then((module) => module.managementPlansRoutes),
                    };
                  }

                  return {
                    path: item.slug,
                    data: {
                      title: item.label,
                      groupLabel: group.label,
                    },
                    loadComponent: () =>
                      import('./admin-placeholder.page').then(
                        (module) => module.AdminPlaceholderPage,
                      ),
                  };
                }),
            ],
}));

export const adminRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, adminPanelGuard],
    loadComponent: () =>
      import('./admin-shell.page').then(
        (module) => module.AdminShellPage,
      ),
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
