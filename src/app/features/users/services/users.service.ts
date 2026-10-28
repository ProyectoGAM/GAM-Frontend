import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { AuthUser } from '../../../core/auth/auth.types';
import { ManagedDevice, ManagedUsersPage, ManagedUsersResponse, PairingCode } from '../interfaces/user-management.interface';
import { UserManagementAction } from '../types/user-management-action.type';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly api = inject(ApiClient);

  users(page = 1): Observable<ManagedUsersPage> {
    return this.api.get<ManagedUsersResponse>('users', { params: { page } }).pipe(map((response) => {
      const nested = Array.isArray(response.data) ? null : response.data;
      const meta = nested?.meta ?? response.meta;
      const last = meta?.last_page;
      return {
        users: nested ? nested.data : response.data as AuthUser[],
        page,
        lastPage: typeof last === 'number' && Number.isSafeInteger(last) && last >= page ? last : null,
      };
    }));
  }

  devices(): Observable<ManagedDevice[]> {
    return this.api.get<{ data: ManagedDevice[] }>('shared-devices').pipe(map((response) => response.data));
  }

  execute(action: UserManagementAction): Observable<unknown> {
    switch (action.kind) {
      case 'create': return this.api.post<{ data: AuthUser }>('users', action.request);
      case 'status': return this.api.patch(`users/${action.userId}/status`, { enabled: action.enabled });
      case 'roles': return this.api.put(`users/${action.userId}/roles`, { roles: action.roles });
      case 'pin': return this.api.put(`users/${action.userId}/pin`, { pin: action.pin, pin_confirmation: action.confirmation });
      case 'deletePin': return this.api.delete(`users/${action.userId}/pin`);
      case 'unlockPin': return this.api.post(`users/${action.userId}/pin/unlock`, {});
      case 'password': return this.api.put(`users/${action.userId}/password`, { password: action.password, password_confirmation: action.confirmation });
      case 'sessions': return this.api.delete(`users/${action.userId}/sessions`);
      case 'code': return this.api.post<PairingCode>('shared-devices/codes', { name: action.name });
      case 'revokeDevice': return this.api.delete(`shared-devices/${encodeURIComponent(action.deviceId)}/pairing`);
    }
  }
}
