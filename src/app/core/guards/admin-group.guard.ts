import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { canAccessAdminPath, canAccessGroup, AdminGroup } from '../auth/access-policy';
import { AuthStore } from '../auth/auth.store';

export const adminGroupGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();

  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  const group = route.data['group'] as AdminGroup | undefined;
  return group && canAccessGroup(auth.user(), group) ? true : router.parseUrl('/acceso-denegado');
};

export const adminGroupChildGuard: CanActivateChildFn = async (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();

  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  const groupIndex = route.pathFromRoot.findIndex((ancestor) => ancestor.routeConfig?.data?.['group']);
  const group = route.pathFromRoot[groupIndex]?.data['group'] as AdminGroup | undefined;
  const path = route.pathFromRoot.slice(groupIndex + 1).flatMap((child) => child.url.map((segment) => segment.path)).join('/');
  const user = auth.user();
  return group && (path ? canAccessAdminPath(user, group, path) : canAccessGroup(user, group))
    ? true : router.parseUrl('/acceso-denegado');
};
