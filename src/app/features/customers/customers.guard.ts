import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../../core/auth/auth.store';
import { isAdminUser } from '../../core/auth/access-policy';

export const manageCustomersGuard: CanActivateFn = () => {
  const user = inject(AuthStore).user();
  return isAdminUser(user) || user?.permissions?.includes('customers.manage')
    ? true : inject(Router).parseUrl('/acceso-denegado');
};
