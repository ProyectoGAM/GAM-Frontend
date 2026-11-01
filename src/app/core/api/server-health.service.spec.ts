import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_CONFIG } from '../config/api.config';
import { ServerHealthService } from './server-health.service';

describe('ServerHealthService', () => {
  let service: ServerHealthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ServerHealthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    service = TestBed.inject(ServerHealthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stop();
    http.verify();
    vi.useRealTimers();
  });

  it('reports online only after the health endpoint responds successfully', async () => {
    const check = service.check();
    expect(service.state()).toBe('checking');
    http.expectOne('/api/v1/health').flush({ status: 'ok' });
    await check;
    expect(service.state()).toBe('online');
  });

  it('reports offline when the backend health endpoint cannot be reached', async () => {
    const check = service.check();
    http.expectOne('/api/v1/health').flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await check;
    expect(service.state()).toBe('offline');
  });

  it('checks immediately and repeats every ten seconds while started', async () => {
    vi.useFakeTimers();
    service.start();
    http.expectOne('/api/v1/health').flush({ status: 'ok' });
    await vi.waitFor(() => expect(service.state()).toBe('online'));

    await vi.advanceTimersByTimeAsync(10_000);
    http.expectOne('/api/v1/health').flush({ status: 'ok' });
    await vi.waitFor(() => expect(service.state()).toBe('online'));
    service.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    http.expectNone('/api/v1/health');
  });
});
