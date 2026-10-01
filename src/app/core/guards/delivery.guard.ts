import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { hasDeliveryRole } from '../auth/access-policy';
import { AuthStore } from '../auth/auth.store';

export const deliveryGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.whenReady();

  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  return hasDeliveryRole(auth.user()) ? true : router.parseUrl('/acceso-denegado');
};
