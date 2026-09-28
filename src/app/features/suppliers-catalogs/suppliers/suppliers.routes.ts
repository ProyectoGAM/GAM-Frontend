import { Routes } from '@angular/router';

export const suppliersRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: { title: 'Proveedores', groupLabel: 'Proveedores' },
    loadComponent: () => import('./suppliers-list.page').then((module) => module.SuppliersListPage),
  },
  {
    path: 'nuevo',
    data: { title: 'Nuevo proveedor', groupLabel: 'Proveedores' },
    loadComponent: () => import('./supplier-create.page').then((module) => module.SupplierCreatePage),
  },
  {
    path: ':id/editar',
    data: { title: 'Editar proveedor', groupLabel: 'Proveedores' },
    loadComponent: () => import('./supplier-edit.page').then((module) => module.SupplierEditPage),
  },
];
