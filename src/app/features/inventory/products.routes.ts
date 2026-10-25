import { Routes } from '@angular/router';

export const productsRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: { title: 'Productos', groupLabel: 'Inventario' },
    loadComponent: () => import('./pages/products-list/products-list.page').then((module) => module.ProductsListPage),
  },
  {
    path: 'nuevo',
    data: { title: 'Nuevo producto', groupLabel: 'Inventario' },
    loadComponent: () => import('./pages/product-create/product-create.page').then((module) => module.ProductCreatePage),
  },
  {
    path: ':id/editar',
    data: { title: 'Editar producto', groupLabel: 'Inventario' },
    loadComponent: () => import('./pages/product-edit/product-edit.page').then((module) => module.ProductEditPage),
  },
];
