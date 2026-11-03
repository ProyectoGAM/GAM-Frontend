import { AuthUser, AuthUserResponse, SharedDevice } from '../../../core/auth/auth.types';

interface CreateManagedUserBase {
  name: string;
  rol_id: number;
}

export interface CreatePersonalUser extends CreateManagedUserBase {
  email: string;
  password: string;
  password_confirmation: string;
}

export interface CreatePinUser extends CreateManagedUserBase {
  email: null;
  pin: string;
  pin_confirmation: string;
  up_id: number;
}

export interface ManagedDevice extends SharedDevice {
  last_seen_at?: string | null;
}

export interface DeviceProductionUnit {
  id: number;
  name: string;
  status: 'active' | 'inactive';
}

export interface UserPageMetadata {
  current_page?: number;
  last_page?: number;
}

export interface ManagedUsersResponse {
  data: AuthUserResponse[] | { data: AuthUserResponse[]; meta?: UserPageMetadata };
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
