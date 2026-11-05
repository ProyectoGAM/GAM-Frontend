import { ActivatedRouteSnapshot, CanActivateChildFn, CanActivateFn, PRIMARY_OUTLET, Router } from '@angular/router';
import { inject } from '@angular/core';

import { canAccessAdminPath, canAccessGroup, AdminGroup } from '../auth/access-policy';
import { AuthStore } from '../auth/auth.store';

async function checkAdminGroup(route: ActivatedRouteSnapshot) {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();

  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  const group = route.data['group'] as AdminGroup | undefined;
  const segments: string[] = [];
  let child = route.children.find((snapshot) => snapshot.outlet === PRIMARY_OUTLET);
  while (child) {
    segments.push(...child.url.map((segment) => segment.path));
    child = child.children.find((snapshot) => snapshot.outlet === PRIMARY_OUTLET);
  }
  const path = segments.join('/');
  const user = auth.user();
  return group && (path ? canAccessAdminPath(user, group, path) : canAccessGroup(user, group))
    ? true : router.parseUrl('/acceso-denegado');
}

export const adminGroupGuard: CanActivateFn = (route) => checkAdminGroup(route);

export const adminGroupChildGuard: CanActivateChildFn = (route) => {
  const groupRoute = route.pathFromRoot.find((ancestor) => ancestor.routeConfig?.data?.['group']);
  return groupRoute ? checkAdminGroup(groupRoute) : inject(Router).parseUrl('/acceso-denegado');
};
