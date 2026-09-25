import { Routes } from '@angular/router';

export const productionUnitsRoutes: Routes = [
  {
    path: ':id/editar',
    loadComponent: () => import('./pages/production-unit-edit/production-unit-edit.page')
      .then((module) => module.ProductionUnitEditPage),
  },
  {
    path: ':id/galpon/:houseId',
    loadComponent: () => import('./pages/poultry-house-detail/poultry-house-detail.page')
      .then((module) => module.PoultryHouseDetailPage),
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/production-unit-detail/production-unit-detail.page')
      .then((module) => module.ProductionUnitDetailPage),
  },
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

export const poultryHousesListRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/poultry-houses-list/poultry-houses-list.page')
      .then((module) => module.PoultryHousesListPage),
  },
];
