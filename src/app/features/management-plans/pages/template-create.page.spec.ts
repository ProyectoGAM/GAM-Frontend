import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { PlanTemplate } from '../interfaces/management-plan';
import { ManagementPlansService } from '../services/management-plans.service';
import { TemplateCreatePage } from './template-create.page';

describe('Template create page', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows field errors and never sends an incomplete template', async () => {
    const createTemplate = vi.fn().mockReturnValue(of({ data: {} }));
    TestBed.configureTestingModule({
      imports: [TemplateCreatePage],
      providers: [provideRouter([]), { provide: ManagementPlansService, useValue: { createTemplate, catalogOptions: vi.fn().mockResolvedValue([]) } }],
    });
    const fixture = TestBed.createComponent(TemplateCreatePage);
    fixture.detectChanges();

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Ingresá un nombre para la plantilla.');
    expect(page.textContent).toContain('Seleccioná el tipo de actividad.');
    expect(page.textContent).toContain('Ingresá un título.');
    expect(page.querySelector('#template-name')?.getAttribute('aria-invalid')).toBe('true');
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('reveals the required condition when the checkbox is selected', () => {
    TestBed.configureTestingModule({
      imports: [TemplateCreatePage],
      providers: [provideRouter([]), { provide: ManagementPlansService, useValue: { createTemplate: vi.fn(), catalogOptions: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(TemplateCreatePage);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('.conditional-control input')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activities()[0].conditional).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('#activity-condition-1')).not.toBeNull();
  });

  it('keeps local edits and blocks another save when a newer version causes a conflict', async () => {
    const old: PlanTemplate = {
      id: 'template-id', name: 'Plan', description: null, status: 'active', current_version: 1,
      published_version: null, version_status: 'draft', activities: [{
        id: 'activity-id', type: 'weighing', title: 'Pesaje inicial', timing_kind: 'day',
        start_day: 1, end_day: null, start_week: null, end_week: null, interval_days: null,
        conditional: false, condition: null, notes: null, catalog_type: null, catalog_snapshot: null,
      }],
    };
    const latest: PlanTemplate = { ...old, current_version: 2, activities: [{ ...old.activities[0], title: 'Pesaje ajeno' }] };
    let changed = false;
    const template = vi.fn().mockImplementation(() => of({ data: changed ? latest : old }));
    const reviseTemplate = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000003' });
    TestBed.configureTestingModule({
      imports: [TemplateCreatePage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'template-id' }) } } },
        { provide: ManagementPlansService, useValue: { template, reviseTemplate, catalogOptions: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(TemplateCreatePage);
    await fixture.componentInstance.loadForEdit();
    fixture.componentInstance.patchActivity(1, { title: 'Mi cambio local' });
    changed = true;

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(reviseTemplate).toHaveBeenCalledWith('template-id', expect.objectContaining({ expected_version: 1 }), expect.any(String));
    expect(fixture.componentInstance.activities()[0].title).toBe('Mi cambio local');
    expect(fixture.componentInstance.latestTemplate()?.current_version).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cambió la actividad 1: Pesaje ajeno.');
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });
});
