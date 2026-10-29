import { Routes } from '@angular/router';

import { manageCustomersGuard } from './customers.guard';

export const customersRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'clientes' },
  { path: 'clientes', data: { title: 'Clientes', groupLabel: 'Clientes' }, loadComponent: () => import('./pages/customer-list/customer-list.page').then((m) => m.CustomerListPage) },
  { path: 'nuevo-cliente', canActivate: [manageCustomersGuard], data: { title: 'Nuevo cliente', groupLabel: 'Clientes' }, loadComponent: () => import('./pages/customer-editor/customer-editor.page').then((m) => m.CustomerEditorPage) },
  { path: 'clientes/:id/editar', canActivate: [manageCustomersGuard], data: { title: 'Editar cliente', groupLabel: 'Clientes' }, loadComponent: () => import('./pages/customer-editor/customer-editor.page').then((m) => m.CustomerEditorPage) },
  { path: 'clientes/:id', data: { title: 'Ficha del cliente', groupLabel: 'Clientes' }, loadComponent: () => import('./pages/customer-detail/customer-detail.page').then((m) => m.CustomerDetailPage) },
];
