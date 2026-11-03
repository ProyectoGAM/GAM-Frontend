import { AuthUser, AuthUserResponse } from './auth.types';

// Keep the existing UI shape while consuming the server's single authoritative role.
export function authUser(response: AuthUserResponse): AuthUser {
  return { ...response, roles: response.rol !== undefined ? (response.rol ? [response.rol.clave] : []) : response.roles ?? [] };
}
