import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { IonModal } from '@ionic/angular';
import { Subject, of, throwError } from 'rxjs';

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

describe('Template publication confirmation', () => {
  const draft: PlanTemplate = { ...retiredTemplate, name: 'Plan de prueba', status: 'active', version_status: 'draft' };
  const published: PlanTemplate = { ...draft, version_status: 'published', published_version: 2 };
  let fixture: ComponentFixture<TemplateDetailPage>;
  let template: ReturnType<typeof vi.fn>;
  let publishTemplate: ReturnType<typeof vi.fn>;
  afterEach(() => fixture?.destroy());

  async function setup() {
    template = vi.fn(() => of({ data: draft }));
    publishTemplate = vi.fn(() => of({ data: published }));
    const queryParamMap = convertToParamMap({ version: '2' });
    TestBed.configureTestingModule({ imports: [TemplateDetailPage], providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { user: signal({ roles: [], permissions: ['management-plans.manage'] }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: draft.id }), queryParamMap }, queryParamMap: of(queryParamMap) } },
      { provide: ManagementPlansService, useValue: { template, publishTemplate } },
    ] });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(TemplateDetailPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture.componentInstance;
  }
  function open() {
    (fixture.nativeElement.querySelector('.template-actions button.primary') as HTMLButtonElement).click(); fixture.detectChanges();
    return fixture.debugElement.query(By.directive(IonModal));
  }

  it('opens a named modal with the consequences, focuses its heading and cancels without publishing', async () => {
    const page = await setup();
    const modal = open();
    expect(modal.componentInstance.isOpen).toBe(true);
    expect(modal.nativeElement.getAttribute('aria-labelledby')).toBe('publication-title');
    expect(fixture.nativeElement.querySelector('.action-confirmation')).toBeNull();
    expect(modal.nativeElement.textContent).toContain('Los planes ya asignados conservan su copia');
    expect(publishTemplate).not.toHaveBeenCalled();
    modal.triggerEventHandler('didPresent');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#publication-title'));
    (modal.nativeElement.querySelector('button.outline') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(page.confirmation()).toBeNull(); expect(modal.componentInstance.isOpen).toBe(false);
    open(); modal.triggerEventHandler('didDismiss'); fixture.detectChanges();
    expect(page.confirmation()).toBeNull();
    expect(publishTemplate).not.toHaveBeenCalled();
    await page.confirmAction('publish'); expect(publishTemplate).not.toHaveBeenCalled();
  });

  it('publishes only on confirmation, blocks double submission and dismissal while pending, then closes and refreshes', async () => {
    const page = await setup(); const pending = new Subject<{ data: PlanTemplate }>();
    let finishNavigation!: (value: boolean) => void;
    vi.mocked(TestBed.inject(Router).navigate).mockReturnValue(new Promise<boolean>((resolve) => { finishNavigation = resolve; }));
    publishTemplate.mockReturnValue(pending);
    const modal = open();
    const saving = page.confirmAction('publish'); fixture.detectChanges();
    await page.confirmAction('publish'); page.closePublication();
    expect(publishTemplate).toHaveBeenCalledExactlyOnceWith(draft.id, 2, expect.any(String));
    expect(modal.componentInstance.canDismiss).toBe(false);
    expect(modal.componentInstance.backdropDismiss).toBe(false);
    expect(page.confirmation()).toBe('publish');
    expect((modal.nativeElement.querySelector('button.outline') as HTMLButtonElement).disabled).toBe(true);
    expect(modal.nativeElement.textContent).toContain('Publicando…');
    template.mockReturnValue(of({ data: published })); pending.next({ data: published }); pending.complete();
    await Promise.resolve(); fixture.detectChanges();
    expect(page.workingAction()).toBe('publish');
    expect(modal.componentInstance.isOpen).toBe(false);
    expect(modal.componentInstance.canDismiss).toBe(true);
    finishNavigation(true);
    await saving; await fixture.whenStable(); fixture.detectChanges();
    expect(page.template()?.published_version).toBe(2);
    expect(page.confirmation()).toBeNull();
    expect(fixture.debugElement.query(By.directive(IonModal)).componentInstance.isOpen).toBe(false);
  });

  it('keeps connection errors inside the modal and reuses the idempotency key when confirming again', async () => {
    const page = await setup();
    publishTemplate.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 }))).mockReturnValueOnce(of({ data: published }));
    const modal = open();
    await page.confirmAction('publish'); fixture.detectChanges();
    const first = publishTemplate.mock.calls[0];
    expect(modal.componentInstance.isOpen).toBe(true);
    expect(modal.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
    expect(modal.componentInstance.canDismiss).toBe(true);
    template.mockReturnValue(of({ data: published }));
    await page.confirmAction('publish');
    expect(publishTemplate.mock.calls[1]).toEqual(first);
    expect(page.confirmation()).toBeNull();
  });

  it('closes the modal on version conflict and requires reviewing the new version before publishing again', async () => {
    const page = await setup(); const modal = open();
    publishTemplate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    template.mockReturnValue(of({ data: { ...draft, current_version: 3 } }));
    await page.confirmAction('publish'); fixture.detectChanges();
    expect(modal.componentInstance.isOpen).toBe(false);
    expect(fixture.nativeElement.querySelector('.conflict-card')?.textContent).toContain('Revisar versión actual');
    page.openPublication(); await page.confirmAction('publish');
    expect(page.confirmation()).toBeNull(); expect(publishTemplate).toHaveBeenCalledTimes(1);
  });
});
