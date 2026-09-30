import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../config/api.config';
import { AuthStore } from './auth.store';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  const store = {
    storageIsNative: () => true,
    bearerToken: () => 'personal-secret',
    sharedDeviceToken: () => 'device-id|device-secret',
    sharedSessionId: () => 'session-id',
    handleHttpError: () => undefined,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
        { provide: AuthStore, useValue: store },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => http.verify());

  it('adds native credentials only to the configured API path', () => {
    client.get('/api/v1/inventario/saldos').subscribe();
    const apiRequest = http.expectOne('/api/v1/inventario/saldos');
    expect(apiRequest.request.headers.get('Authorization')).toBe('Bearer personal-secret');
    expect(apiRequest.request.headers.get('X-Shared-Device-Token')).toBe('device-id|device-secret');
    expect(apiRequest.request.headers.get('X-GAM-Session')).toBe('session-id');
    apiRequest.flush({});

    client.get('https://telemetry.example.test/event').subscribe();
    const externalRequest = http.expectOne('https://telemetry.example.test/event');
    expect(externalRequest.request.headers.has('Authorization')).toBe(false);
    expect(externalRequest.request.headers.has('X-Shared-Device-Token')).toBe(false);
    externalRequest.flush({});
  });

  it('forwards an API error to the session store without hiding it', () => {
    const handleHttpError = vi.spyOn(store, 'handleHttpError');
    client.get('/api/v1/me').subscribe({
      error: (error: HttpErrorResponse) => expect(error.status).toBe(401),
    });

    const request = http.expectOne('/api/v1/me');
    request.flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    expect(handleHttpError).toHaveBeenCalled();
  });
});
