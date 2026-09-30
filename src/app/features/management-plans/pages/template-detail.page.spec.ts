import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { PlanTemplate } from '../interfaces/management-plan';
import { ManagementPlansService } from '../services/management-plans.service';
import { TemplateDetailPage } from './template-detail.page';

const retiredTemplate: PlanTemplate = {
  id: 'template-id', name: 'Plan retirado', description: null, status: 'retired',
  current_version: 2, published_version: 1, version_status: 'published', activities: [],
};

function createPage(template: ReturnType<typeof vi.fn>, activateTemplate: ReturnType<typeof vi.fn>): TemplateDetailPage {
  const queryParamMap = convertToParamMap({});
  TestBed.configureTestingModule({ providers: [
    { provide: AuthStore, useValue: { user: signal({ roles: [], permissions: ['management-plans.manage'] }) } },
    { provide: ActivatedRoute, useValue: {
      snapshot: { paramMap: convertToParamMap({ id: 'template-id' }), queryParamMap },
      queryParamMap: of(queryParamMap),
    } },
    { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
    { provide: ManagementPlansService, useValue: { template, activateTemplate } },
  ] });
  return TestBed.runInInjectionContext(() => new TemplateDetailPage());
}

describe('Template detail activation', () => {
  it('reactivates a retired template with its current version and refreshes the detail', async () => {
    const template = vi.fn()
      .mockReturnValueOnce(of({ data: retiredTemplate }))
      .mockReturnValueOnce(of({ data: { ...retiredTemplate, status: 'active' } }));
    const activateTemplate = vi.fn(() => of({ data: { ...retiredTemplate, status: 'active' } }));
    const page = createPage(template, activateTemplate);
    await vi.waitFor(() => expect(page.state()).toBe('ready'));

    await page.confirmAction('activate');

    expect(activateTemplate).toHaveBeenCalledWith('template-id', 2, expect.any(String));
    expect(page.template()?.status).toBe('active');
    expect(page.confirmation()).toBeNull();
  });

  it('shows the changed status after a 409 instead of retrying the write', async () => {
    const activeTemplate = { ...retiredTemplate, status: 'active' };
    const template = vi.fn()
      .mockReturnValueOnce(of({ data: retiredTemplate }))
      .mockReturnValue(of({ data: activeTemplate }));
    const activateTemplate = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 409 })));
    const page = createPage(template, activateTemplate);
    await vi.waitFor(() => expect(page.state()).toBe('ready'));

    await page.confirmAction('activate');

    expect(activateTemplate).toHaveBeenCalledTimes(1);
    expect(page.conflictChanges()).toContain('La plantilla fue activada.');
    expect(page.conflictVersion()).toBe(2);
    expect(page.actionError()).toContain('Revisá la versión actual');
  });
});
