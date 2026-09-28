import { Routes } from '@angular/router';
import { managementPlansGuard } from './management-plans.guard';

export const managementPlansRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'plantillas' },
  { path: 'plantillas', canActivate: [managementPlansGuard], loadComponent: () => import('./pages/templates.page').then((m) => m.TemplatesPage) },
  { path: 'plantillas/:id', canActivate: [managementPlansGuard], loadComponent: () => import('./pages/template-detail.page').then((m) => m.TemplateDetailPage) },
  { path: 'lotes', canActivate: [managementPlansGuard], loadComponent: () => import('./pages/flock-plans.page').then((m) => m.FlockPlansPage) },
  { path: 'lotes/:id', canActivate: [managementPlansGuard], loadComponent: () => import('./pages/flock-plan-detail.page').then((m) => m.FlockPlanDetailPage) },
];
