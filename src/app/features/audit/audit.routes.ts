import { Routes } from '@angular/router';

export const auditRoutes: Routes = [
  { path: '', loadComponent: () => import('./pages/audit-history/audit-history.page').then((module) => module.AuditHistoryPage) },
];
