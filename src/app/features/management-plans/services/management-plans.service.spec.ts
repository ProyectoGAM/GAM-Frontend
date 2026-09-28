import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../../../core/config/api.config';
import { ManagementPlansService } from './management-plans.service';

describe('ManagementPlansService', () => {
  let service: ManagementPlansService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    service = TestBed.inject(ManagementPlansService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('omits the revisions flag normally and sends the backend boolean integer when expanded', () => {
    service.flockPlan('01J00000000000000000000000').subscribe();
    const current = http.expectOne((request) => request.url.endsWith('/plan-manejo'));
    expect(current.request.params.has('include_revisions')).toBe(false);
    current.flush({ data: {} });

    service.flockPlan('01J00000000000000000000000', true).subscribe();
    const expanded = http.expectOne((request) => request.url.endsWith('/plan-manejo'));
    expect(expanded.request.params.get('include_revisions')).toBe('1');
    expanded.flush({ data: {} });
  });

  it('requests a draft only when the caller passes an explicit version', () => {
    service.template('01J00000000000000000000000').subscribe();
    const published = http.expectOne((request) => request.url.includes('plantillas-manejo/'));
    expect(published.request.params.has('version')).toBe(false);
    published.flush({ data: {} });

    service.template('01J00000000000000000000000', 4).subscribe();
    const draft = http.expectOne((request) => request.url.includes('plantillas-manejo/'));
    expect(draft.request.params.get('version')).toBe('4');
    draft.flush({ data: {} });
  });
});
