import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { ManagementPlansService } from '../services/management-plans.service';
import { FlockPlan, PlanActivity } from '../interfaces/management-plan';
import { FlockPlanDetailPage } from './flock-plan-detail.page';

describe('Flock plan detail page', () => {
  const activities: PlanActivity[] = [
    { id: 'preparation', type: 'weighing', title: 'Preparación inicial', timing_kind: 'day',
      start_day: 1, end_day: null, start_week: null, end_week: null, interval_days: null,
      conditional: false, condition: null, notes: null, catalog_type: null, catalog_snapshot: null },
    { id: 'check', type: 'weighing', title: 'Control semanal', timing_kind: 'week',
      start_day: null, end_day: null, start_week: 2, end_week: null, interval_days: null,
      conditional: false, condition: null, notes: null, catalog_type: null, catalog_snapshot: null },
    { id: 'care', type: 'manual_practice', title: 'Seguimiento de adaptación', timing_kind: 'week_range',
      start_day: null, end_day: null, start_week: 1, end_week: 3, interval_days: null,
      conditional: true, condition: 'Si presenta síntomas', notes: null, catalog_type: null, catalog_snapshot: null },
  ];
  const plan: FlockPlan = { id: 'plan-1', flock_id: 'lot-1', baseline_date: '2026-10-07',
    current_revision: 2, source_template: null, source_flock_id: null, revisions: [
      { id: 'revision-2', number: 2, reason: null, created_at: null, activities },
      { id: 'revision-1', number: 1, reason: 'Anterior', created_at: null, activities },
    ] };

  async function renderProgress(status = 'active', unavailable = false, from = 'flock') {
    const queryParamMap = new BehaviorSubject(convertToParamMap({ from }));
    TestBed.configureTestingModule({ imports: [FlockPlanDetailPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'lot-1' }) }, queryParamMap } },
      { provide: ManagementPlansService, useValue: {
        flock: () => unavailable ? throwError(() => new Error('Unavailable')) : of({ data: { id: 'lot-1', code: 'LOTE-1', status } }),
        flockPlan: () => of({ data: plan }),
      } },
    ] });
    const fixture = TestBed.createComponent(FlockPlanDetailPage);
    fixture.componentInstance.now.set(new Date('2026-10-15T12:00:00Z'));
    await fixture.whenStable(); fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement, queryParamMap };
  }

  it.each(['', 'unknown'])('returns to plans by flock when not opened from a flock detail (%s)', async (from) => {
    const { page } = await renderProgress('active', false, from);
    expect(page.querySelector('.back-link')?.getAttribute('href')).toBe('/administracion/manejo-lotes/planes/lotes');
    expect(page.querySelector('.back-link')?.textContent).toContain('Volver a planes por lote');
  });

  it('updates the return destination if the same plan is reopened from another origin', async () => {
    const { fixture, page, queryParamMap } = await renderProgress();
    queryParamMap.next(convertToParamMap({})); fixture.detectChanges();
    expect(page.querySelector('.back-link')?.getAttribute('href')).toBe('/administracion/manejo-lotes/planes/lotes');
    queryParamMap.next(convertToParamMap({ from: 'flock' })); fixture.detectChanges();
    expect(page.querySelector('.back-link')?.getAttribute('href')).toBe('/administracion/lotes/lotes/lot-1');
  });

  it('preserves the original house when returning through the flock plan', async () => {
    const { fixture, page, queryParamMap } = await renderProgress();
    queryParamMap.next(convertToParamMap({ from: 'flock', lotFrom: 'house', unitId: '7', houseId: '22' })); fixture.detectChanges();
    expect(page.querySelector('.back-link')?.getAttribute('href')).toBe('/administracion/lotes/lotes/lot-1?lotFrom=house&unitId=7&houseId=22');
    queryParamMap.next(convertToParamMap({ lotFrom: 'house', unitId: '7', houseId: '22' })); fixture.detectChanges();
    expect(page.querySelector('.back-link')?.getAttribute('href')).toBe('/administracion/manejo-lotes/planes/lotes');
  });

  it('shows the current day and week and highlights every overlapping activity', async () => {
    const { page } = await renderProgress();
    expect(page.querySelector('.back-link')?.getAttribute('href')).toBe('/administracion/lotes/lotes/lot-1');
    expect(page.querySelector('.back-link')?.textContent).toContain('Volver al lote');
    expect(page.textContent).toContain('Día 9');
    expect(page.textContent).toContain('Semana 2');
    expect(page.querySelectorAll('.plan-position .activity.current')).toHaveLength(2);
    expect(page.querySelectorAll('.all-activities .activity')).toHaveLength(3);
    expect(page.querySelectorAll('.all-activities .activity.current')).toHaveLength(2);
    expect(page.querySelectorAll('.plan-position .current-tag')).toHaveLength(2);
    expect(page.querySelector('.plan-position')?.textContent).toContain('Control semanal');
    expect(page.querySelector('.plan-position')?.textContent).toContain('Seguimiento de adaptación');
    expect(page.querySelector('.plan-position')?.textContent).not.toContain('Preparación inicial');
    expect(Array.from(page.querySelectorAll('.plan-position .number')).map((item) => item.textContent?.trim())).toEqual(['02', '03']);
    expect(page.textContent).toContain('2 actividades previstas ahora');
    expect(page.textContent).not.toContain('Según el calendario previsto, incluso con alimentación manual.');
    expect(page.textContent).toContain('Si presenta síntomas');
  });

  it('removes current highlighting when the user switches to an earlier revision', async () => {
    const { fixture, page } = await renderProgress();
    (page.querySelector('.revision-toggle') as HTMLButtonElement).click();
    await fixture.whenStable(); fixture.detectChanges();
    const select = page.querySelector('select') as HTMLSelectElement;
    select.value = '1'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(page.querySelectorAll('.activity.current')).toHaveLength(0);
    expect(page.textContent).toContain('Revisión anterior');
    select.value = '2'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(page.querySelectorAll('.plan-position .activity.current')).toHaveLength(2);
  });

  it('does not highlight present activities for a finalized flock', async () => {
    const { page } = await renderProgress('finished');
    expect(page.querySelectorAll('.activity.current')).toHaveLength(0);
    expect(page.textContent).toContain('Lote finalizado');
  });

  it('keeps the plan visible without inventing current activities when the flock status is unavailable', async () => {
    const { page } = await renderProgress('active', true);
    expect(page.querySelectorAll('.activity')).toHaveLength(3);
    expect(page.querySelectorAll('.activity.current')).toHaveLength(0);
    expect(page.textContent).toContain('Estado del lote no disponible');
  });

  it('does not highlight activities when the current week has none, then refreshes the calendar position', async () => {
    const { fixture, page } = await renderProgress();
    fixture.componentInstance.now.set(new Date('2026-12-01T12:00:00Z')); fixture.detectChanges();
    expect(page.querySelectorAll('.activity.current')).toHaveLength(0);
    expect(page.textContent).toContain('No hay actividades que coincidan');
    expect(page.querySelector('.current-activities')).toBeNull();
  });

  it('shows a read-only empty state when an older flock has no plan', async () => {
    const flockPlan = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    TestBed.configureTestingModule({
      imports: [FlockPlanDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'DEMO-EGG-PROD' }) },
          queryParamMap: of(convertToParamMap({ from: 'flock' })) } },
        { provide: ManagementPlansService, useValue: {
          flock: () => of({ data: { id: 'DEMO-EGG-PROD', code: 'DEMO-EGG-PROD' } }),
          flockPlan,
        } },
      ],
    });

    const fixture = TestBed.createComponent(FlockPlanDetailPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(flockPlan).toHaveBeenCalledWith('DEMO-EGG-PROD');
    expect(page.querySelector('.empty-plan')?.textContent).toContain('Este lote no tiene plan de manejo');
    expect(page.querySelector('.empty-plan')?.textContent).toContain('Los lotes nuevos reciben su plan al crearlos desde Lotes');
    expect(page.querySelector('.back-link')?.getAttribute('href')).toBe('/administracion/lotes/lotes/DEMO-EGG-PROD');
    expect(page.textContent).not.toContain('Asignar plan');
    expect(page.querySelector('select')).toBeNull();
  });
});
