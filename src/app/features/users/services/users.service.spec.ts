import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { UsersService } from './users.service';

describe('UsersService API contract', () => {
  let service: UsersService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    service = TestBed.inject(UsersService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads the complete named directory across pages, including disabled users', async () => {
    const result = service.allUsers();
    http.expectOne('/api/v1/users?page=1').flush({ data: [{ id: 1, name: 'Admin' }], meta: { last_page: 2 } });
    await Promise.resolve();
    http.expectOne('/api/v1/users?page=2').flush({ data: [{ id: 4, name: 'Ana', deleted_at: '2026-10-31' }], meta: { last_page: 2 } });
    expect((await result).map((user) => user.name)).toEqual(['Admin', 'Ana']);
  });

  it('stops at an empty page without pagination metadata and rejects repeated pages', async () => {
    const result = service.allUsers();
    http.expectOne('/api/v1/users?page=1').flush({ data: [{ id: 1, name: 'Admin' }] });
    await Promise.resolve(); http.expectOne('/api/v1/users?page=2').flush({ data: [] });
    expect(await result).toHaveLength(1);
    const repeated = service.allUsers();
    const failure = expect(repeated).rejects.toThrow('no permite avanzar');
    http.expectOne('/api/v1/users?page=1').flush({ data: [{ id: 1, name: 'Admin' }] });
    await Promise.resolve(); http.expectOne('/api/v1/users?page=2').flush({ data: [{ id: 1, name: 'Admin' }] });
    await failure;
  });

  it('supports both collection envelopes without inventing missing pagination metadata', () => {
    service.users(2).subscribe((page) => expect(page).toEqual({ users: [], page: 2, lastPage: null }));
    http.expectOne('/api/v1/users?page=2').flush({ data: [] });
    service.users().subscribe((page) => expect(page.lastPage).toBe(3));
    http.expectOne('/api/v1/users?page=1').flush({ data: { data: [], meta: { current_page: 1, last_page: 3 } } });
  });

  it('sends current account contracts including multiple roles and leading-zero PINs', () => {
    const request = { name: 'Ana', email: 'ana@example.test', password: 'example-only', password_confirmation: 'example-only', role: 'employee' as const };
    service.execute({ kind: 'create', request }).subscribe();
    const create = http.expectOne('/api/v1/users'); expect(create.request.method).toBe('POST'); expect(create.request.body).toEqual(request); create.flush({});
    service.execute({ kind: 'roles', userId: 4, roles: ['employee', 'delivery'] }).subscribe();
    const roles = http.expectOne('/api/v1/users/4/roles'); expect(roles.request.body).toEqual({ roles: ['employee', 'delivery'] }); roles.flush({});
    service.execute({ kind: 'pin', userId: 4, pin: '0007', confirmation: '0007' }).subscribe();
    const pin = http.expectOne('/api/v1/users/4/pin'); expect(pin.request.body).toEqual({ pin: '0007', pin_confirmation: '0007' }); pin.flush({});
    service.execute({ kind: 'password', userId: 4, password: 'example-only', confirmation: 'example-only' }).subscribe();
    const password = http.expectOne('/api/v1/users/4/password'); expect(password.request.body).toEqual({ password: 'example-only', password_confirmation: 'example-only' }); password.flush({});
  });

  it('uses the implemented account status, unlock, PIN deletion and session revocation endpoints', () => {
    service.execute({ kind: 'status', userId: 4, enabled: false }).subscribe();
    const status = http.expectOne('/api/v1/users/4/status'); expect(status.request.method).toBe('PATCH'); expect(status.request.body).toEqual({ enabled: false }); status.flush({});
    service.execute({ kind: 'unlockPin', userId: 4 }).subscribe();
    const unlock = http.expectOne('/api/v1/users/4/pin/unlock'); expect(unlock.request.method).toBe('POST'); expect(unlock.request.body).toEqual({}); unlock.flush({});
    service.execute({ kind: 'deletePin', userId: 4 }).subscribe();
    const pin = http.expectOne('/api/v1/users/4/pin'); expect(pin.request.method).toBe('DELETE'); pin.flush({});
    service.execute({ kind: 'sessions', userId: 4 }).subscribe();
    const sessions = http.expectOne('/api/v1/users/4/sessions'); expect(sessions.request.method).toBe('DELETE'); sessions.flush({});
  });

  it('lists devices, generates a code and revokes pairing through existing endpoints', () => {
    service.devices().subscribe((devices) => expect(devices).toEqual([]));
    http.expectOne('/api/v1/shared-devices').flush({ data: [] });
    service.execute({ kind: 'code', name: 'Tablet' }).subscribe();
    const code = http.expectOne('/api/v1/shared-devices/codes'); expect(code.request.body).toEqual({ name: 'Tablet' }); code.flush({ code: 'EXAMPLE', expires_at: '2030-01-01T00:00:00Z' });
    service.execute({ kind: 'revokeDevice', deviceId: 'device-1' }).subscribe();
    const revoke = http.expectOne('/api/v1/shared-devices/device-1/pairing'); expect(revoke.request.method).toBe('DELETE'); revoke.flush({});
  });
});
