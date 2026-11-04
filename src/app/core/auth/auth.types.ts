export type DeviceMode = 'personal' | 'shared';

export type AuthStatus =
  | 'initializing'
  | 'personal_guest'
  | 'personal_authenticated'
  | 'shared_verifying'
  | 'shared_selector'
  | 'shared_authenticated'
  | 'connection_error';

export interface AuthUser {
  id: number;
  name: string;
  email: string | null;
  deleted_at: string | null;
  roles: string[];
  permissions: string[];
  rol?: { id: number; clave: string; nombre: string } | null;
  modalidad_acceso?: 'email_password' | 'device_pin';
  up_id?: number | null;
}

export interface AuthUserResponse extends Omit<AuthUser, 'roles'> {
  roles?: string[];
}

export interface AuthSession {
  id: string;
  kind: 'personal' | 'shared_user';
  auth_method: 'password' | 'pin';
  expires_at: string | null;
  idle_timeout_seconds: number | null;
  up_id?: number | null;
}

export interface PersonalLoginResponse {
  access_token?: string;
  token_type?: 'Bearer';
  expires_at?: string | null;
  abilities?: string[];
  user: AuthUserResponse;
  session: AuthSession;
}

export interface MeResponse {
  data: AuthUserResponse;
  session: AuthSession | null;
}

export interface SharedDevice {
  id: string;
  name: string;
  expires_at: string | null;
  revoked_at: string | null;
  active_session_id?: string | null;
  up_id?: number | null;
}

export interface SharedDeviceStatusResponse {
  data: SharedDevice;
}

export interface SharedPairingResponse {
  device: {
    id: string;
    name: string;
    expires_at: string | null;
    up_id?: number | null;
  };
  device_token?: string;
}

export interface SharedUser {
  id: number;
  name: string;
}

export interface SharedUsersResponse {
  data: SharedUser[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface ApiProblem {
  code?: string;
  message?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}
