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
  nombre: string;
  correo_electronico: string;
  deleted_at: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthSession {
  id: string;
  kind: 'personal' | 'shared_user';
  auth_method: 'password' | 'pin';
  expires_at: string | null;
  idle_timeout_seconds: number | null;
}

export interface PersonalLoginResponse {
  access_token?: string;
  token_type?: 'Bearer';
  expires_at?: string | null;
  abilities?: string[];
  user: AuthUser;
  session: AuthSession;
}

export interface MeResponse {
  data: AuthUser;
  session: AuthSession | null;
}

export interface SharedDevice {
  id: string;
  nombre: string;
  expires_at: string | null;
  revoked_at: string | null;
  active_session_id?: string | null;
}

export interface SharedDeviceStatusResponse {
  data: SharedDevice;
}

export interface SharedPairingResponse {
  device: {
    id: string;
    nombre: string;
    expires_at: string | null;
  };
  device_token?: string;
}

export interface SharedUser {
  id: number;
  nombre: string;
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
