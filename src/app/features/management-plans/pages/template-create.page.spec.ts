import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { PlanTemplate } from '../interfaces/management-plan';
import { emptyActivity } from '../services/management-plan-editor';
import { ManagementPlansService } from '../services/management-plans.service';
import { TemplateCreatePage } from './template-create.page';

describe('Template create page', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
  afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });
  afterEach(() => vi.unstubAllGlobals());

  async function renderRation(catalogOptions = vi.fn().mockResolvedValue([{ value: '42', label: 'BB' }])) {
    const createTemplate = vi.fn().mockReturnValue(of({ data: { id: 'new-template', current_version: 1 } }));
    TestBed.configureTestingModule({ imports: [TemplateCreatePage], providers: [provideRouter([]),
      { provide: ManagementPlansService, useValue: { createTemplate, catalogOptions } },
    ] });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TemplateCreatePage);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const type = page.querySelector('#activity-type-1') as HTMLSelectElement;
    type.value = 'ration_change'; type.dispatchEvent(new Event('change'));
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, page, component: fixture.componentInstance, createTemplate, catalogOptions };
  }

  it('labels rations clearly and requires a recipe and grams per bird without an empty catalogue choice', async () => {
    const { fixture, page, component, createTemplate } = await renderRation();
    expect(page.querySelector('option[value="ration_change"]')?.textContent).toBe('Ración');
    const recipe = page.querySelector('#activity-catalog-1') as HTMLSelectElement;
    expect(recipe.required).toBe(true);
    expect(recipe.querySelector('option[value=""]')?.hasAttribute('disabled')).toBe(true);
    expect(recipe.textContent).not.toContain('Sin referencia');
    expect(page.querySelector('.catalog-field label')?.textContent).not.toContain('opcional');
    expect(page.querySelector<HTMLInputElement>('#activity-grams-1')?.required).toBe(true);
    expect(page.querySelector('.conditional-control')).toBeNull();
    component.name.set('Plan BB'); component.patchActivity(1, { title: 'BB', startWeek: '1' });
    await component.submit(); fixture.detectChanges(); await fixture.whenStable();
    expect(createTemplate).not.toHaveBeenCalled();
    expect(page.querySelector('#activity-catalog-1')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.querySelector('#activity-grams-1')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.textContent).toContain('gramos enteros por ave');
  });

  it('blocks saving when recipes fail to load and supports retry without accepting stale references', async () => {
    const catalogOptions = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([{ value: '42', label: 'BB' }]);
    const { fixture, page, component, createTemplate } = await renderRation(catalogOptions);
    component.name.set('Plan BB'); component.patchActivity(1, { title: 'BB', startWeek: '1', catalogRef: '42', gramsPerBird: '20' });
    expect(page.textContent).not.toContain('Podés guardar la actividad sin referencia');
    await component.submit(); fixture.detectChanges(); await fixture.whenStable();
    expect(createTemplate).not.toHaveBeenCalled();
    (page.querySelector('.catalog-retry') as HTMLButtonElement).click();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(catalogOptions).toHaveBeenCalledTimes(2);
    component.patchActivity(1, { catalogRef: '99' });
    await component.submit(); fixture.detectChanges(); await fixture.whenStable();
    expect(createTemplate).not.toHaveBeenCalled();
    expect(page.textContent).toContain('receta de ración activa disponible');
    component.patchActivity(1, { catalogRef: '42' });
    await component.submit();
    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({ activities: [expect.objectContaining({ catalog_ref: 42, grams_per_bird: 20 })] }), expect.any(String));
  });

  it('keeps a day-based schedule and clears conditions when switching to a ration', async () => {
    const { fixture, page, component } = await renderRation();
    component.patchActivity(1, { type: 'manual_practice', timingKind: 'day', startDay: '1', conditional: true, condition: 'Si corresponde' });
    component.changeType(1, { target: { value: 'ration_change' } } as unknown as Event);
    fixture.detectChanges();
    expect(component.activities()[0]).toMatchObject({ timingKind: 'day', startDay: '1', conditional: false, condition: '' });
    expect(page.querySelector<HTMLOptionElement>('#activity-timing-1 option[value="day"]')?.disabled).toBe(false);
    expect(page.querySelector<HTMLOptionElement>('#activity-timing-1 option[value="day_recurrence"]')?.disabled).toBe(true);
  });
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
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Ingresá un nombre para la plantilla.');
    expect(page.textContent).toContain('Seleccioná el tipo de actividad.');
    expect(page.textContent).toContain('Ingresá un título.');
    expect(page.querySelector('#template-name')?.getAttribute('aria-invalid')).toBe('true');
    expect(createTemplate).not.toHaveBeenCalled();
    const summary = page.querySelector('.error-summary');
    expect(document.activeElement).toBe(summary);
    expect(summary?.textContent).toContain('No se guardó la plantilla');
    expect(page.querySelector('.submit-feedback')?.textContent).toContain('Ver error');
    (summary?.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(page.querySelector('#template-name'));
    await fixture.componentInstance.submit();
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(summary);
  });

  it('reveals a rejected collapsed activity and directs the user to its invalid field without losing the draft', async () => {
    const createTemplate = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422,
      error: { errors: { 'activities.1.title': ['Este título ya está en uso.'] } } })));
    TestBed.configureTestingModule({ imports: [TemplateCreatePage], providers: [provideRouter([]),
      { provide: ManagementPlansService, useValue: { createTemplate } },
    ] });
    const fixture = TestBed.createComponent(TemplateCreatePage);
    const component = fixture.componentInstance;
    component.name.set('Mi plan');
    component.activities.set([1, 2].map((id) => ({ ...emptyActivity(id), type: 'weighing',
      title: `Postura ${id}`, timingKind: 'day', startDay: String(id) })));
    fixture.detectChanges();
    await component.submit(); fixture.detectChanges(); await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(component.name()).toBe('Mi plan');
    expect(component.activities()[1].title).toBe('Postura 2');
    expect(component.expandedId()).toBe(2);
    expect(page.querySelector('.has-errors')?.textContent).toContain('Este título ya está en uso.');
    expect(document.activeElement).toBe(page.querySelector('.error-summary'));
    (page.querySelector('.error-summary button') as HTMLButtonElement).click();
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(page.querySelector('#activity-title-2'));
    (page.querySelector('.submit-feedback button') as HTMLButtonElement).click();
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(page.querySelector('.error-summary'));
    component.expandedId.set(null); fixture.detectChanges();
    expect(page.querySelector('.has-errors .activity-error-hint')?.textContent).toContain('contiene errores');
  });

  it.each([0, 403, 500])('draws attention to a submission failure without field errors (%s)', async (status) => {
    TestBed.configureTestingModule({ imports: [TemplateCreatePage], providers: [provideRouter([]),
      { provide: ManagementPlansService, useValue: {
        createTemplate: () => throwError(() => new HttpErrorResponse({ status })),
      } },
    ] });
    const fixture = TestBed.createComponent(TemplateCreatePage);
    fixture.componentInstance.name.set('Mi plan');
    fixture.componentInstance.activities.set([{ ...emptyActivity(1), type: 'weighing', title: 'Postura', timingKind: 'day', startDay: '1' }]);
    fixture.detectChanges();
    await fixture.componentInstance.submit(); fixture.detectChanges(); await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(document.activeElement).toBe(page.querySelector('.error-summary'));
    expect(page.querySelector('.error-summary button')).toBeNull();
    expect(page.querySelector('.submit-feedback')).not.toBeNull();
    expect(fixture.componentInstance.name()).toBe('Mi plan');
    expect(fixture.componentInstance.saving()).toBe(false);
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
        id: 'activity-id', type: 'weighing', title: 'Postura inicial', timing_kind: 'day',
        start_day: 1, end_day: null, start_week: null, end_week: null, interval_days: null,
        conditional: false, condition: null, notes: null, catalog_type: null, catalog_snapshot: null,
      }],
    };
    const latest: PlanTemplate = { ...old, current_version: 2, activities: [{ ...old.activities[0], title: 'Postura ajeno' }] };
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
    await fixture.whenStable();

    expect(reviseTemplate).toHaveBeenCalledWith('template-id', expect.objectContaining({ expected_version: 1 }), expect.any(String));
    expect(fixture.componentInstance.activities()[0].title).toBe('Mi cambio local');
    expect(fixture.componentInstance.latestTemplate()?.current_version).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cambió la actividad 1: Postura ajeno.');
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(document.activeElement).toBe((fixture.nativeElement as HTMLElement).querySelector('.error-summary'));
  });
});
