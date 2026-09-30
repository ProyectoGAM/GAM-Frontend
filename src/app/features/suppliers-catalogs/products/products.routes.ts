import { Routes } from '@angular/router';

export const productsRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: { title: 'Productos', groupLabel: 'Proveedores' },
    loadComponent: () => import('./products-list.page').then((module) => module.ProductsListPage),
  },
  {
    path: 'nuevo',
    data: { title: 'Nuevo producto', groupLabel: 'Proveedores' },
    loadComponent: () => import('./product-create.page').then((module) => module.ProductCreatePage),
  },
  {
    path: ':id/editar',
    data: { title: 'Editar producto', groupLabel: 'Proveedores' },
    loadComponent: () => import('./product-edit.page').then((module) => module.ProductEditPage),
  },
];
