import { CreatePersonalUser, CreatePinUser } from '../interfaces/user-management.interface';

export type CreateManagedUser = CreatePersonalUser | CreatePinUser;
export type UserCreationMode = 'email_password' | 'device_pin';

export type UserManagementAction =
  | { kind: 'create'; request: CreateManagedUser }
  | { kind: 'status'; userId: number; enabled: boolean }
  | { kind: 'roles'; userId: number; roleId: number }
  | { kind: 'pin'; userId: number; pin: string; confirmation: string }
  | { kind: 'deletePin' | 'unlockPin' | 'sessions'; userId: number }
  | { kind: 'password'; userId: number; password: string; confirmation: string }
  | { kind: 'code'; name: string; upId: number }
  | { kind: 'revokeDevice'; deviceId: string };
