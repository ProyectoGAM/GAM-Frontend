import { Routes } from '@angular/router';

export const productionUnitsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/production-units-list/production-units-list.page')
      .then((module) => module.ProductionUnitsListPage),
  },
];

export const productionUnitCreateRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/production-unit-create/production-unit-create.page')
      .then((module) => module.ProductionUnitCreatePage),
  },
];
