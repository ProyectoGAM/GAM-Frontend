import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, firstValueFrom, map, Observable, reduce } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { AuthUser } from '../../../core/auth/auth.types';
import { authUser } from '../../../core/auth/auth-user';
import { DeviceProductionUnit, ManagedDevice, ManagedUsersPage, ManagedUsersResponse, PairingCode } from '../interfaces/user-management.interface';
import { UserManagementAction } from '../types/user-management-action.type';
import { ManagedRoleDefinition, ManagedRolesResponse } from '../interfaces/role-management.interface';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly api = inject(ApiClient);

  users(page = 1): Observable<ManagedUsersPage> {
    return this.api.get<ManagedUsersResponse>('users', { params: { page } }).pipe(map((response) => {
      const nested = Array.isArray(response.data) ? null : response.data;
      const meta = nested?.meta ?? response.meta;
      const last = meta?.last_page;
      return {
        users: (Array.isArray(response.data) ? response.data : response.data.data).map(authUser),
        page,
        lastPage: typeof last === 'number' && Number.isSafeInteger(last) && last >= page ? last : null,
      };
    }));
  }

  async allUsers(): Promise<AuthUser[]> {
    const users = new Map<number, AuthUser>();
    for (let page = 1; ; page++) {
      const result = await firstValueFrom(this.users(page));
      if (!result.users.length) return [...users.values()];
      if (result.users.every((user) => users.has(user.id))) throw new Error('El directorio no permite avanzar de página.');
      for (const user of result.users) users.set(user.id, user);
      if (result.lastPage !== null && page >= result.lastPage) return [...users.values()];
    }
  }

  devices(): Observable<ManagedDevice[]> {
    return this.api.get<{ data: ManagedDevice[] }>('shared-devices').pipe(map((response) => response.data));
  }

  roleOptions(): Observable<ManagedRoleDefinition[]> {
    const page = (number: number) => this.api.get<ManagedRolesResponse>('roles', { params: { page: number, por_pagina: 100 } });
    return page(1).pipe(
      expand((response) => response.meta.current_page < response.meta.last_page ? page(response.meta.current_page + 1) : EMPTY),
      reduce((roles, response) => [...roles, ...response.data], [] as ManagedRoleDefinition[]),
    );
  }

  deviceUnits(): Observable<DeviceProductionUnit[]> {
    const page = (number: number) => this.api.get<{ data: DeviceProductionUnit[]; meta: { current_page: number; last_page: number } }>(
      'production-units', { params: { page: number } },
    );
    return page(1).pipe(
      expand((response) => response.meta.current_page < response.meta.last_page ? page(response.meta.current_page + 1) : EMPTY),
      reduce((units, response) => [...units, ...response.data], [] as DeviceProductionUnit[]),
    );
  }

  execute(action: UserManagementAction): Observable<unknown> {
    switch (action.kind) {
      case 'create': return this.api.post<{ data: AuthUser }>('users', action.request);
      case 'status': return this.api.patch(`users/${action.userId}/status`, { enabled: action.enabled });
      case 'roles': return this.api.put(`usuarios/${action.userId}/rol`, { rol_id: action.roleId });
      case 'pin': return this.api.put(`users/${action.userId}/pin`, { pin: action.pin, pin_confirmation: action.confirmation });
      case 'deletePin': return this.api.delete(`users/${action.userId}/pin`);
      case 'unlockPin': return this.api.post(`users/${action.userId}/pin/unlock`, {});
      case 'password': return this.api.put(`users/${action.userId}/password`, { password: action.password, password_confirmation: action.confirmation });
      case 'sessions': return this.api.delete(`users/${action.userId}/sessions`);
      case 'code': return this.api.post<PairingCode>('shared-devices/codes', { name: action.name, up_id: action.upId });
      case 'revokeDevice': return this.api.delete(`shared-devices/${encodeURIComponent(action.deviceId)}/pairing`);
    }
  }
}
