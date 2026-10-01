import { Routes } from '@angular/router';

export const flocksRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/flocks-list/flocks-list.page')
      .then((module) => module.FlocksListPage),
  },
];
