import { Routes } from '@angular/router';
import type { FlockFractionationPage } from './pages/flock-fractionation/flock-fractionation.page';

export const flocksRoutes: Routes = [
  {
    path: 'nuevo',
    loadComponent: () => import('./pages/flock-create/flock-create.page')
      .then((module) => module.FlockCreatePage),
  },
  {
    path: ':id/recoleccion',
    loadComponent: () => import('./pages/flock-collections/flock-collections.page')
      .then((module) => module.FlockCollectionsPage),
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
    path: ':id/mortalidad',
    loadComponent: () => import('./pages/flock-mortalities/flock-mortalities.page')
      .then((module) => module.FlockMortalitiesPage),
  },
  {
    path: ':id/alimentacion',
    loadComponent: () => import('./pages/flock-feeding/flock-feeding.page')
      .then((module) => module.FlockFeedingPage),
  },
  {
    path: ':id/fraccionar',
    loadComponent: () => import('./pages/flock-fractionation/flock-fractionation.page')
      .then((module) => module.FlockFractionationPage),
    canDeactivate: [(page: FlockFractionationPage) => page.canLeave()],
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
