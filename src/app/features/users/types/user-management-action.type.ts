import { CreateManagedUser } from '../interfaces/user-management.interface';
import { ManagedRole } from './managed-role.type';

export type UserManagementAction =
  | { kind: 'create'; request: CreateManagedUser }
  | { kind: 'status'; userId: number; enabled: boolean }
  | { kind: 'roles'; userId: number; roles: ManagedRole[] }
  | { kind: 'pin'; userId: number; pin: string; confirmation: string }
  | { kind: 'deletePin' | 'unlockPin' | 'sessions'; userId: number }
  | { kind: 'password'; userId: number; password: string; confirmation: string }
  | { kind: 'code'; name: string }
  | { kind: 'revokeDevice'; deviceId: string };
