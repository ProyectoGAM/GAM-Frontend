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

  it('filters drafts on the server before pagination', () => {
    service.templates(2, undefined, true).subscribe();
    const drafts = http.expectOne((request) => request.url.endsWith('/plantillas-manejo'));
    expect(drafts.request.params.get('has_draft')).toBe('1');
    expect(drafts.request.params.get('page')).toBe('2');
    expect(drafts.request.params.has('status')).toBe(false);
    drafts.flush({ data: [], meta: { current_page: 2, last_page: 2, total: 11 } });

    service.templates(1, 'retired').subscribe();
    const retired = http.expectOne((request) => request.url.endsWith('/plantillas-manejo'));
    expect(retired.request.params.has('has_draft')).toBe(false);
    expect(retired.request.params.get('status')).toBe('retired');
    retired.flush({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
  });

  it('creates a draft with an idempotency key and the complete activity list', () => {
    const request = {
      name: 'Ponedora estándar', description: null, activities: [{
        type: 'weighing' as const, title: 'Control', timing_kind: 'day' as const,
        start_day: 28, end_day: null, start_week: null, end_week: null, interval_days: null,
        conditional: false, condition: null, notes: null, catalog_ref: null,
      }],
    };
    service.createTemplate(request, '00000000-0000-4000-8000-000000000001').subscribe();
    const create = http.expectOne((item) => item.url.endsWith('/plantillas-manejo') && item.method === 'POST');
    expect(create.request.headers.get('Idempotency-Key')).toBe('00000000-0000-4000-8000-000000000001');
    expect(create.request.body).toEqual(request);
    create.flush({ data: {} });
  });

  it('sends optimistic version and idempotency for revision, publication, retirement and activation', () => {
    const id = '01J00000000000000000000000';
    const key = '00000000-0000-4000-8000-000000000002';
    const revision = { expected_version: 2, name: 'Revisada', description: null, activities: [] };
    service.reviseTemplate(id, revision, key).subscribe();
    const patch = http.expectOne((item) => item.url.endsWith(`/plantillas-manejo/${id}`) && item.method === 'PATCH');
    expect(patch.request.body).toEqual(revision);
    expect(patch.request.headers.get('Idempotency-Key')).toBe(key);
    patch.flush({ data: {} });

    service.publishTemplate(id, 3, key).subscribe();
    const publish = http.expectOne((item) => item.url.endsWith(`/plantillas-manejo/${id}/publicacion`) && item.method === 'POST');
    expect(publish.request.body).toEqual({ expected_version: 3 });
    expect(publish.request.headers.get('Idempotency-Key')).toBe(key);
    publish.flush({ data: {} });

    service.retireTemplate(id, 3, key).subscribe();
    const retire = http.expectOne((item) => item.url.endsWith(`/plantillas-manejo/${id}/retiro`) && item.method === 'POST');
    expect(retire.request.body).toEqual({ expected_version: 3 });
    expect(retire.request.headers.get('Idempotency-Key')).toBe(key);
    retire.flush({ data: {} });

    service.activateTemplate(id, 3, key).subscribe();
    const activate = http.expectOne((item) => item.url.endsWith(`/plantillas-manejo/${id}/activacion`) && item.method === 'POST');
    expect(activate.request.body).toEqual({ expected_version: 3 });
    expect(activate.request.headers.get('Idempotency-Key')).toBe(key);
    activate.flush({ data: {} });
  });
});
