import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { canAccessGroup, AdminGroup } from '../auth/access-policy';
import { AuthStore } from '../auth/auth.store';

export const adminGroupGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();

  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  const group = route.data['group'] as AdminGroup | undefined;
  return group && canAccessGroup(auth.user(), group) ? true : router.parseUrl('/acceso-denegado');
};
