import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { ADMIN_GROUP_IDS, canAccessGroup } from '../auth/access-policy';
import { AuthStore } from '../auth/auth.store';

export const adminPanelGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  return ADMIN_GROUP_IDS.some((group) => canAccessGroup(auth.user(), group))
    ? true
    : router.parseUrl('/acceso-denegado');
};
