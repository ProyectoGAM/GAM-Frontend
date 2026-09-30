import { Routes } from '@angular/router';

export const inventoryRoutes: Routes = [
  {
    path: 'existencias',
    children: [
      {
        path: '',
        data: { title: 'Existencias', groupLabel: 'Inventario' },
        loadComponent: () => import('./pages/stock/stock.page').then((m) => m.StockPage),
      },
      {
        path: 'ubicaciones',
        data: { title: 'Ubicaciones de stock', groupLabel: 'Inventario' },
        loadComponent: () => import('./pages/stock-locations/stock-locations.page').then((m) => m.StockLocationsPage),
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
    data: { title: 'Ajustes y pérdidas', groupLabel: 'Inventario' },
    loadComponent: () => import('./pages/movement-form/movement-form.page').then((m) => m.MovementFormPage),
  },
  {
    path: 'donaciones',
    data: { title: 'Donaciones', groupLabel: 'Inventario' },
    loadComponent: () => import('../admin/admin-placeholder.page').then((m) => m.AdminPlaceholderPage),
  },
];
