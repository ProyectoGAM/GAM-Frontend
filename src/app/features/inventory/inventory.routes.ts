import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

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
          const permissions = auth.user()?.permissions ?? [];
          return auth.isAdmin() || permissions.includes('inventory.view')
            || !permissions.some((permission) => ['products.view', 'products.manage', 'management-plans.manage'].includes(permission))
            ? true
            : inject(Router).parseUrl('/administracion/inventario/existencias/productos');
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
