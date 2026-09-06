import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/auth.page').then((m) => m.AuthPage),
  },
];
