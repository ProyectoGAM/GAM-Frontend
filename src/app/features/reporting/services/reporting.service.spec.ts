import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { FileDownloadService } from '../../../core/native/file-download.service';
import { ReportingService } from './reporting.service';

describe('Reporting service', () => {
  let api: ReportingService; let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }, { provide: FileDownloadService, useValue: { download: vi.fn(), shareLink: vi.fn() } }] }); api = TestBed.inject(ReportingService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => { http.verify(); vi.useRealTimers(); });
  it('uses the canonical Spanish source and preview contracts', () => {
    api.sources().subscribe(); http.expectOne('/api/v1/reportes/fuentes').flush({ data: [] });
    api.preview('lots.egg-production', { columns: ['quantity'], filters: [] }).subscribe();
    const preview = http.expectOne('/api/v1/reportes/lots.egg-production/previsualizaciones');
    expect(preview.request.method).toBe('POST'); expect(preview.request.body.columns).toEqual(['quantity']); preview.flush({ data: {} });
  });
  it('exports the full query with a stable idempotency header', () => {
    api.requestExport('lots.egg-production', { page: 4, filters: [] }, 'xlsx', 'stable-key').subscribe();
    const request = http.expectOne('/api/v1/reportes/lots.egg-production/exportaciones');
    expect(request.request.headers.get('Idempotency-Key')).toBe('stable-key'); expect(request.request.body.page).toBe(1); expect(request.request.body.format).toBe('xlsx'); request.flush({ data: {} });
  });
  it('stops polling after the completed response', async () => {
    vi.useFakeTimers(); const updates: string[] = [];
    const subscription = api.watchExport(8).subscribe((response) => updates.push(response.data.status));
    await vi.advanceTimersByTimeAsync(0); http.expectOne('/api/v1/exportaciones-reportes/8').flush({ data: { status: 'processing' } });
    await vi.advanceTimersByTimeAsync(3000); http.expectOne('/api/v1/exportaciones-reportes/8').flush({ data: { status: 'completed' } });
    await vi.advanceTimersByTimeAsync(9000); http.expectNone('/api/v1/exportaciones-reportes/8'); expect(updates).toEqual(['processing', 'completed']); expect(subscription.closed).toBe(true);
  });
});
