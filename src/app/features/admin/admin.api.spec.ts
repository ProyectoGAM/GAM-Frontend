import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../core/config/api.config';
import { AdminApi } from './admin.api';

describe('AdminApi backend contract', () => {
  let api: AdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses user-management paths and backend request fields', () => {
    api.users().subscribe();
    http.expectOne('/api/v1/users').flush({ data: { data: [], links: {}, meta: {} } });

    api.createUser({
      name: 'Ana',
      email: 'ana@example.test',
      password: 'long-password',
      password_confirmation: 'long-password',
      role: 'employee',
    }).subscribe();
    const create = http.expectOne('/api/v1/users');
    expect(create.request.body).toEqual({
      name: 'Ana', email: 'ana@example.test', password: 'long-password',
      password_confirmation: 'long-password', role: 'employee',
    });
    create.flush({});

    api.changeStatus(4, false).subscribe();
    const status = http.expectOne('/api/v1/users/4/status');
    expect(status.request.body).toEqual({ enabled: false });
    status.flush({});

    api.unlockPin(4).subscribe();
    http.expectOne('/api/v1/users/4/pin/unlock').flush({});
    api.revokeSessions(4).subscribe();
    http.expectOne('/api/v1/users/4/sessions').flush({});
  });

  it('uses the shared-device administration endpoints', () => {
    api.devices().subscribe();
    http.expectOne('/api/v1/shared-devices').flush({ data: [] });

    api.generateCode('Tablet').subscribe();
    const code = http.expectOne('/api/v1/shared-devices/codes');
    expect(code.request.body).toEqual({ name: 'Tablet' });
    code.flush({ code: 'ABCD1234', expires_at: '2030-01-01T00:00:00Z' });

    api.revokeDevice('device-1').subscribe();
    http.expectOne('/api/v1/shared-devices/device-1/pairing').flush({});
  });
});
