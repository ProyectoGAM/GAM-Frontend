import { Routes } from '@angular/router';
import type { UsersPage } from './pages/users.page';

const page = () => import('./pages/users.page').then((module) => module.UsersPage);

export const usersRoutes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: page, data: { tab: 'users' } },
  { path: 'crear', loadComponent: page, data: { tab: 'create' } },
  { path: 'dispositivos', loadComponent: page, data: { tab: 'devices' } },
  { path: 'roles', loadComponent: page, data: { tab: 'roles' }, canDeactivate: [(component: UsersPage) => component.canLeave()] },
  { path: 'usuarios', pathMatch: 'full', redirectTo: '' },
  { path: 'nuevo-usuario', pathMatch: 'full', redirectTo: 'crear' },
  { path: ':userId', loadComponent: page, data: { tab: 'users' } },
];
