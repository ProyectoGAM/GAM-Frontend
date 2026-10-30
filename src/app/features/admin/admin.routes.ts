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
    group.id === 'acceso-rapido'
      ? [{ path: '', loadChildren: () => import('../quick-access/quick-access.routes').then((module) => module.quickAccessRoutes) }]
      : group.id === 'usuarios'
      ? [{ path: '', loadChildren: () => import('../users/users.routes').then((module) => module.usersRoutes) }]
      : group.id === 'clientes'
      ? [{ path: '', loadChildren: () => import('../customers/customers.routes').then((module) => module.customersRoutes) }]
      : group.id === 'inventario'
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
              ...(group.id === 'repartos' ? [{ path: 'catalogo-y-precios', pathMatch: 'full' as const, redirectTo: '/administracion/inventario/presentaciones-huevos' }] : []),
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
                  if (group.id === 'reportes' && item.slug === 'reportes') {
                    return { path: item.slug, loadChildren: () => import('../reporting/reporting.routes').then((module) => module.reportingRoutes) };
                  }
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

                  if (group.id === 'manejo-lotes' && item.slug === 'planes') {
                    return {
                      path: 'planes',
                      loadChildren: () => import('../management-plans/management-plans.routes').then((module) => module.managementPlansRoutes),
                    };
                  }

                  if (group.id === 'manejo-lotes' && item.slug === 'Recetas') {
                    return {
                      path: item.slug,
                      loadChildren: () => import('../feed-recipes/feed-recipes.routes').then((module) => module.feedRecipesRoutes),
                    };
                  }

                  if (group.id === 'manejo-lotes' && item.slug === 'vacunacion') {
                    return {
                      path: item.slug,
                      loadChildren: () => import('../health-catalogs/health-catalogs.routes').then((module) => module.vaccinationRoutes),
                    };
                  }

                  if (group.id === 'manejo-lotes' && item.slug === 'medicacion') {
                    return {
                      path: item.slug,
                      loadChildren: () => import('../health-catalogs/health-catalogs.routes').then((module) => module.medicationRoutes),
                    };
                  }

                  if (group.id === 'lotes' && item.slug === 'lotes') {
                    return {
                      path: item.slug,
                      loadChildren: () => import('../flocks/flocks.routes').then((module) => module.flocksRoutes),
                    };
                  }

                  if (group.id === 'repartos' && item.slug === 'repartos') {
                    return {
                      path: item.slug,
                      loadComponent: () => import('../deliveries/admin-deliveries.page').then((module) => module.AdminDeliveriesPage),
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
      { path: 'proveedores/productos/nuevo', pathMatch: 'full', redirectTo: '/administracion/inventario/existencias/productos/nuevo' },
      { path: 'proveedores/productos/:id/editar', pathMatch: 'full', redirectTo: '/administracion/inventario/existencias/productos/:id/editar' },
      { path: 'proveedores/productos', pathMatch: 'full', redirectTo: '/administracion/inventario/existencias/productos' },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: adminIndexRedirect,
      },
      ...moduleRoutes,
    ],
  },
];
