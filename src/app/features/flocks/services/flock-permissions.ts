import { AdminUser, isAdminUser } from '../../../core/auth/access-policy';
import { hasAnyPermission } from '../../../core/auth/permission-keys';

export function hasFlockPermission(user: AdminUser | null, permission: string): boolean {
  return isAdminUser(user) || hasAnyPermission(user?.permissions, permission);
}
