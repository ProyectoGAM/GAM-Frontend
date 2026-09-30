import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { hasManagementPlansPermission } from '../../core/auth/access-policy';
import { AuthStore } from '../../core/auth/auth.store';

export const managementPlansGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  return hasManagementPlansPermission(auth.user(), 'view') ? true : router.parseUrl('/acceso-denegado');
};

export const managementPlansManageGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isAuthenticated()) return router.parseUrl('/auth');
  return hasManagementPlansPermission(auth.user(), 'manage') ? true : router.parseUrl('/acceso-denegado');
};
