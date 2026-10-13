import { Routes } from '@angular/router';

const loadReports = () => import('./pages/reports.page').then((module) => module.ReportsPage);

export const reportingRoutes: Routes = [
  { path: '', pathMatch: 'full', data: { screen: 'home' }, loadComponent: loadReports },
  { path: 'temas/:topic', data: { screen: 'topic' }, loadComponent: loadReports },
  { path: 'guardados', data: { screen: 'saved' }, loadComponent: loadReports },
  { path: 'archivos', data: { screen: 'files' }, loadComponent: loadReports },
  { path: 'crear', data: { screen: 'create' }, loadComponent: loadReports },
  { path: 'ver/:sourceKey', data: { screen: 'view' }, loadComponent: loadReports },
];
