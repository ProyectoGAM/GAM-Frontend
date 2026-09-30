import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { AuthStore } from '../auth/auth.store';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.whenReady();

  return auth.isAuthenticated()
    ? true
    : router.parseUrl('/auth');
};
