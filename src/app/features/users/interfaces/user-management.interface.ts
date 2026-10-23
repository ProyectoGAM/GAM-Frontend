import { AuthUser, SharedDevice } from '../../../core/auth/auth.types';
import { ManagedRole } from '../types/managed-role.type';

export interface CreateManagedUser {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  role: ManagedRole;
}

export interface ManagedDevice extends SharedDevice {
  last_seen_at?: string | null;
}

export interface UserPageMetadata {
  current_page?: number;
  last_page?: number;
}

export interface ManagedUsersResponse {
  data: AuthUser[] | { data: AuthUser[]; meta?: UserPageMetadata };
  meta?: UserPageMetadata;
}

export interface ManagedUsersPage {
  users: AuthUser[];
  page: number;
  lastPage: number | null;
}

export interface PairingCode {
  code: string;
  expires_at: string;
}

export interface UserActionConfirmation {
  title: string;
  target: string;
  description: string;
  button: string;
  destructive?: boolean;
}
