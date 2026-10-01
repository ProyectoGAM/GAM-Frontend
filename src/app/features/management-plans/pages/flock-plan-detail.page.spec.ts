import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ManagementPlansService } from '../services/management-plans.service';
import { FlockPlanDetailPage } from './flock-plan-detail.page';

describe('Flock plan detail page', () => {
  it('shows a read-only empty state when an older flock has no plan', async () => {
    const flockPlan = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    TestBed.configureTestingModule({
      imports: [FlockPlanDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'DEMO-EGG-PROD' }) } } },
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
    expect(page.textContent).not.toContain('Asignar plan');
    expect(page.querySelector('select')).toBeNull();
  });
});
