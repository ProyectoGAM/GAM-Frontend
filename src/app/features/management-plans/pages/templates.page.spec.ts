import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { PlanPage, PlanTemplate } from '../interfaces/management-plan';
import { ManagementPlansService } from '../services/management-plans.service';
import { TemplatesPage } from './templates.page';

const template = (status: PlanTemplate['status']): PlanTemplate => ({
  id: `${status}-id`,
  name: status === 'active' ? 'Plan activo' : 'Plan retirado',
  description: null,
  status,
  current_version: 1,
  published_version: 1,
  version_status: status === 'active' ? 'published' : 'retired',
  activities: [],
});

const page = (status: PlanTemplate['status'], currentPage = 1): PlanPage<PlanTemplate> => ({
  data: [template(status)],
  meta: { current_page: currentPage, last_page: status === 'active' ? 2 : 1, total: status === 'active' ? 11 : 1 },
});

describe('Templates page', () => {
  it('shows active templates first and keeps retired templates in a separate paginated view', async () => {
    const templates = vi.fn((currentPage: number, status: PlanTemplate['status']) => of(page(status, currentPage)));
    TestBed.configureTestingModule({
      imports: [TemplatesPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user: signal(null) } },
        { provide: ManagementPlansService, useValue: { templates } },
      ],
    });
    const fixture = TestBed.createComponent(TemplatesPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(templates).toHaveBeenCalledWith(1, 'active', false);
    expect(element.textContent).toContain('Plan activo');
    expect(element.textContent).not.toContain('Plan retirado');
    expect(element.querySelector('.template-status-switch button')?.getAttribute('aria-pressed')).toBe('true');

    element.querySelector<HTMLButtonElement>('.pagination button:last-child')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(templates).toHaveBeenLastCalledWith(2, 'active', false);

    const search = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'Sin coincidencias';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.textContent).toContain('Ninguna plantilla coincide en esta página.');

    element.querySelectorAll<HTMLButtonElement>('.template-status-switch button')[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(templates).toHaveBeenLastCalledWith(1, 'retired', false);
    expect(search.value).toBe('');
    expect(element.textContent).toContain('Plan retirado');
    expect(element.textContent).not.toContain('Plan activo');
    expect(element.querySelector('.template-card .badge.retired')?.textContent).toContain('Retirada');
    expect(element.querySelectorAll('.template-status-switch button')[1].getAttribute('aria-pressed')).toBe('true');
    expect(element.textContent).not.toContain('Borradores');
  });

  it('shows draft tags and a server-paginated draft view only to managers', async () => {
    const draft: PlanTemplate = {
      ...template('active'), id: 'draft-id', name: 'Plan pendiente', current_version: 2,
      published_version: 1, version_status: 'published',
    };
    const retiredDraft: PlanTemplate = {
      ...template('retired'), id: 'retired-draft-id', name: 'Plan retirado con borrador',
      current_version: 3, published_version: 2,
    };
    const templates = vi.fn((currentPage: number, _status?: PlanTemplate['status'], hasDraft = false) => of({
      data: hasDraft ? currentPage === 1 ? [draft, retiredDraft] : [] : [draft],
      meta: { current_page: currentPage, last_page: hasDraft ? 2 : 1, total: hasDraft ? 11 : 1 },
    }));
    TestBed.configureTestingModule({
      imports: [TemplatesPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user: signal({ roles: [], permissions: ['management-plans.manage'] }) } },
        { provide: ManagementPlansService, useValue: { templates } },
      ],
    });
    const fixture = TestBed.createComponent(TemplatesPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.template-card .badge.draft')?.textContent).toContain('Borrador v2');
    element.querySelectorAll<HTMLButtonElement>('.template-status-switch button')[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(templates).toHaveBeenLastCalledWith(1, undefined, true);
    expect(element.textContent).toContain('Plan retirado con borrador');
    expect(element.querySelector('.template-card .badge.draft')?.textContent).toContain('Borrador');
    expect(element.querySelector('.template-card .badge.retired')?.textContent).toContain('Retirada');

    element.querySelector<HTMLButtonElement>('.pagination button:last-child')?.click();
    await fixture.whenStable();
    expect(templates).toHaveBeenLastCalledWith(2, undefined, true);
  });

  it('does not reveal a pending draft to a reader', async () => {
    const pending: PlanTemplate = {
      ...template('active'), current_version: 2, published_version: 1,
    };
    const templates = vi.fn(() => of({ data: [pending], meta: { current_page: 1, last_page: 1, total: 1 } }));
    TestBed.configureTestingModule({
      imports: [TemplatesPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user: signal({ roles: [], permissions: ['management-plans.view'] }) } },
        { provide: ManagementPlansService, useValue: { templates } },
      ],
    });
    const fixture = TestBed.createComponent(TemplatesPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('Borrador');
    expect(element.textContent).not.toContain('Abrir borrador');
    expect(element.textContent).not.toContain('Revisión pendiente');
    expect(templates).toHaveBeenCalledWith(1, 'active', false);
  });

  it('ignores an older active response after switching to retired templates', async () => {
    const pendingActive = new Subject<PlanPage<PlanTemplate>>();
    const templates = vi.fn((_currentPage: number, status: PlanTemplate['status']) =>
      status === 'active' ? pendingActive.asObservable() : of(page('retired')),
    );
    TestBed.configureTestingModule({
      imports: [TemplatesPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user: signal(null) } },
        { provide: ManagementPlansService, useValue: { templates } },
      ],
    });
    const fixture = TestBed.createComponent(TemplatesPage);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.template-status-switch button')[1].click();
    await Promise.resolve();
    pendingActive.next(page('active'));
    pendingActive.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.templates()[0].status).toBe('retired');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Plan activo');
  });
});
