import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../config/api.config';
import { AuthApi } from './auth.api';

describe('AuthApi backend contract', () => {
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the backend login, profile, logout and confirmation routes', () => {
    api.personalLogin('admin@example.test', 'secret').subscribe();
    const nativeLogin = http.expectOne('/api/v1/auth/login');
    expect(nativeLogin.request.body).toEqual({ email: 'admin@example.test', password: 'secret' });
    nativeLogin.flush({});

    api.webLogin('admin@example.test', 'secret').subscribe();
    const webLogin = http.expectOne('/api/v1/auth/web/login');
    expect(webLogin.request.body).toEqual({ email: 'admin@example.test', password: 'secret' });
    expect(webLogin.request.withCredentials).toBe(true);
    webLogin.flush({});

    api.me().subscribe();
    http.expectOne('/api/v1/me').flush({});

    api.personalLogout().subscribe();
    http.expectOne('/api/v1/auth/logout').flush({});
    api.webLogout().subscribe();
    http.expectOne('/api/v1/auth/web/logout').flush({});

    api.confirmPassword('secret', true).subscribe();
    const confirm = http.expectOne('/api/v1/auth/web/confirm-password');
    expect(confirm.request.body).toEqual({ password: 'secret' });
    confirm.flush({});
  });

  it('uses backend pairing and shared-session paths and payload keys', () => {
    api.pair('ABCD1234', 'Tablet', false).subscribe();
    const pairing = http.expectOne('/api/v1/shared-devices/pairing');
    expect(pairing.request.body).toEqual({ code: 'ABCD1234', device_name: 'Tablet' });
    pairing.flush({});

    api.sharedStatus(true).subscribe();
    http.expectOne('/api/v1/shared-device/web').flush({});
    api.sharedUsers(true).subscribe();
    http.expectOne('/api/v1/shared-device/web/users').flush({});

    api.pinLogin(12, '0007', true).subscribe();
    const pinLogin = http.expectOne('/api/v1/shared-device/web/login-pin');
    expect(pinLogin.request.body).toEqual({ user_id: 12, pin: '0007' });
    pinLogin.flush({});

    api.finalize('session-1', true).subscribe();
    const finalize = http.expectOne('/api/v1/shared-device/web/finalize');
    expect(finalize.request.body).toEqual({ session_id: 'session-1' });
    finalize.flush({});
  });
});
