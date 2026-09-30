import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { AuthStore } from '../auth/auth.store';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.whenReady();

  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  return auth.isAdmin() ? true : router.parseUrl('/acceso-denegado');
};
