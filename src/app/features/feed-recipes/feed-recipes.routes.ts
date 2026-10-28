import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { hasFeedRecipesPermission } from '../../core/auth/access-policy';
import type { RecipeCreatePage } from './pages/recipe-create/recipe-create.page';

const permissionGuard = (permission: 'view' | 'manage'): CanActivateFn => () => {
  const auth = inject(AuthStore);
  return auth.isAdmin() || hasFeedRecipesPermission(auth.user(), permission) ? true : inject(Router).parseUrl('/acceso-denegado');
};

export const feedRecipesRoutes: Routes = [
  {
    path: '', pathMatch: 'full', data: { title: 'Recetas', groupLabel: 'Manejo de Lotes' },
    loadComponent: () => import('./pages/recipes-list/recipes-list.page').then((module) => module.RecipesListPage),
  },
  {
    path: 'nueva', canActivate: [permissionGuard('manage')], data: { title: 'Nueva receta', groupLabel: 'Manejo de Lotes' },
    canDeactivate: [(component: RecipeCreatePage) => component.canLeave()],
    loadComponent: () => import('./pages/recipe-create/recipe-create.page').then((module) => module.RecipeCreatePage),
  },
  {
    path: ':id', canActivate: [permissionGuard('view')], data: { title: 'Detalle de receta', groupLabel: 'Manejo de Lotes' },
    loadComponent: () => import('./pages/recipe-detail/recipe-detail.page').then((module) => module.RecipeDetailPage),
  },
];
