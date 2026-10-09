import { Routes } from '@angular/router';

export const flocksRoutes: Routes = [
  {
    path: 'nuevo',
    loadComponent: () => import('./pages/flock-create/flock-create.page')
      .then((module) => module.FlockCreatePage),
  },
  {
    path: ':id/pesajes/:weighingId',
    loadComponent: () => import('./pages/flock-weighing-record/flock-weighing-record.page')
      .then((module) => module.FlockWeighingRecordPage),
  },
  {
    path: ':id/pesajes',
    loadComponent: () => import('./pages/flock-weighings/flock-weighings.page')
      .then((module) => module.FlockWeighingsPage),
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/flock-detail/flock-detail.page')
      .then((module) => module.FlockDetailPage),
  },
  {
    path: '',
    loadComponent: () => import('./pages/flocks-list/flocks-list.page')
      .then((module) => module.FlocksListPage),
  },
];
