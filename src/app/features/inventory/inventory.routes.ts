import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { canAccessAdminItem } from '../../core/auth/access-policy';
import { hasAnyPermission } from '../../core/auth/permission-keys';

export const inventoryRoutes: Routes = [
  {
    path: 'presentaciones-huevos',
    data: { title: 'Presentaciones de huevos', groupLabel: 'Inventario' },
    loadComponent: () => import('./pages/egg-presentations/egg-presentations.page').then((m) => m.EggPresentationsPage),
  },
  {
    path: 'existencias',
    children: [
      {
        path: 'productos',
        loadChildren: () => import('./products.routes').then((m) => m.productsRoutes),
      },
      {
        path: '',
        canActivate: [() => {
          const auth = inject(AuthStore);
          const user = auth.user();
          if (auth.isAdmin() || hasAnyPermission(user?.permissions, 'can_view_inventory')) return true;
          const destination = ['productos', 'huevos', 'raciones'].find((slug) =>
            canAccessAdminItem(user, 'inventario', `existencias/${slug}`));
          return inject(Router).parseUrl(destination
            ? `/administracion/inventario/existencias/${destination}` : '/acceso-denegado');
        }],
        data: { title: 'Existencias', groupLabel: 'Inventario' },
        loadComponent: () => import('./pages/stock/stock.page').then((m) => m.StockPage),
      },
      {
        path: 'ubicaciones',
        data: { title: 'Ubicaciones de stock', groupLabel: 'Inventario' },
        loadComponent: () => import('./pages/stock-locations/stock-locations.page').then((m) => m.StockLocationsPage),
      },
      {
        path: 'raciones',
        data: { title: 'Stock de raciones', groupLabel: 'Inventario' },
        loadComponent: () => import('./pages/feed-stock/feed-stock.page').then((m) => m.FeedStockPage),
      },
      {
        path: 'huevos',
        children: [
          {
            path: '',
            data: { title: 'Stock de huevos', groupLabel: 'Inventario' },
            loadComponent: () => import('./pages/egg-stock/egg-stock.page').then((m) => m.EggStockPage),
          },
          {
            path: 'movimientos',
            children: [{
              path: ':movement',
              data: { title: 'Detalle de movimiento de huevos', groupLabel: 'Inventario' },
              loadComponent: () => import('./pages/egg-movement-detail/egg-movement-detail.page').then((m) => m.EggMovementDetailPage),
            }],
          },
        ],
      },
    ],
  },
  {
    path: 'movimientos',
    children: [
      {
        path: '',
        data: { title: 'Movimientos', groupLabel: 'Inventario' },
        loadComponent: () => import('./pages/movements/movements.page').then((m) => m.MovementsPage),
      },
      {
        path: ':movement',
        data: { title: 'Detalle de movimiento', groupLabel: 'Inventario' },
        loadComponent: () => import('./pages/movement-detail/movement-detail.page').then((m) => m.MovementDetailPage),
      },
    ],
  },
  {
    path: 'ajustes-y-perdidas',
    data: { title: 'Registrar movimiento', groupLabel: 'Inventario' },
    loadComponent: () => import('./pages/movement-form/movement-form.page').then((m) => m.MovementFormPage),
  },
  {
    path: 'donaciones',
    data: { title: 'Donaciones', groupLabel: 'Inventario' },
    loadComponent: () => import('./pages/egg-donations/egg-donations.page').then((m) => m.EggDonationsPage),
  },
];
