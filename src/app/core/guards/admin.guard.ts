import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { AuthStore } from '../auth/auth.store';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return auth.isAdmin() ? true : router.parseUrl('/home');
};
