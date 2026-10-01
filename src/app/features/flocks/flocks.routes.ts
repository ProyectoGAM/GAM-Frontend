import { Routes } from '@angular/router';

export const flocksRoutes: Routes = [
  {
    path: 'nuevo',
    loadComponent: () => import('./pages/flock-create/flock-create.page')
      .then((module) => module.FlockCreatePage),
  },
  {
    path: '',
    loadComponent: () => import('./pages/flocks-list/flocks-list.page')
      .then((module) => module.FlocksListPage),
  },
];
