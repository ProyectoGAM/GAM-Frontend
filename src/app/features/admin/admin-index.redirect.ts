import { inject } from '@angular/core';
import { RedirectFunction, Router } from '@angular/router';

import { AuthStore } from '../../core/auth/auth.store';
import { firstVisibleAdminPath } from './admin-navigation';

export const adminIndexRedirect: RedirectFunction = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return router.parseUrl(firstVisibleAdminPath(auth.user()) ?? '/acceso-denegado');
};
