import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { FlockHouseTaskRequest } from '../../interfaces/flock-house-task.interface';
import { Flock } from '../../interfaces/flock.interface';
import { FlockDetailService, todayInLotsTimezone } from '../../services/flock-detail.service';
import { FlockFeedingService } from '../../services/flock-feeding.service';
import { FlockMortalitiesService } from '../../services/flock-mortalities.service';
import { FeedingEditorComponent } from '../feeding-editor/feeding-editor.component';
import { FlockMortalitySectionComponent } from '../flock-mortality-section/flock-mortality-section.component';
import { FlockHouseTaskDialogComponent } from './flock-house-task-dialog.component';

const flock = { id: 'lot-1', code: 'LOTE', status: 'active', production_unit_id: 7, poultry_house_id: 22,
  version: 1, current_quantity: 100, entry_date: '2026-01-01', established_at: '2026-01-01T12:00:00Z' } as Flock;
const request: FlockHouseTaskRequest = { kind: 'mortality', flockId: flock.id, origin: { unitId: 7, houseId: 22 },
  trigger: null, houseName: 'Galpón 22', unitName: 'UP 7' };

describe('FlockHouseTaskDialogComponent', () => {
  const getFlock = vi.fn(); const record = vi.fn(); const change = vi.fn();
  const actor = signal<{ id: number } | null>({ id: 1 });
  let restore: () => void;
  beforeEach(() => {
    restore = stubNativeDialog(); vi.resetAllMocks(); actor.set({ id: 1 });
    getFlock.mockReturnValue(of(flock)); record.mockReturnValue(of({})); change.mockReturnValue(of({}));
    TestBed.configureTestingModule({ imports: [FlockHouseTaskDialogComponent], providers: [provideRouter([]),
      { provide: AuthStore, useValue: { user: actor } },
      { provide: FlockDetailService, useValue: { flock: getFlock } },
      { provide: FlockMortalitiesService, useValue: { record } },
      { provide: FlockFeedingService, useValue: { current: () => of({ modo: 'manual', receta_id: 1,
        cantidad_diaria_g: '1000', finalizado: false, etapa: { recipe_id: 1, recipe_snapshot: { name: 'Ración actual' } } }),
      balances: () => of([]), change } },
    ] });
    // Exercise the editor's inputs/outputs without emulating Ionic's overlay engine in jsdom.
    TestBed.overrideComponent(FeedingEditorComponent, { set: { template: '', imports: [] } });
  });
  afterEach(() => restore());

  async function render(kind: 'mortality' | 'feeding' = 'mortality') {
    const fixture = TestBed.createComponent(FlockHouseTaskDialogComponent);
    fixture.componentRef.setInput('request', { ...request, kind });
    const closed = vi.fn(); fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, closed };
  }

  it('opens the mortality form over the current URL and cancels without a write', async () => {
    const { fixture, closed } = await render();
    expect(fixture.nativeElement.querySelector('.registration-dialog').open).toBe(true);
    expect(fixture.nativeElement.querySelector('.task-status-dialog').open).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Galpón 22');
    const section = fixture.debugElement.query(By.directive(FlockMortalitySectionComponent)).componentInstance as FlockMortalitySectionComponent;
    section.closeForm(); expect(closed).toHaveBeenCalledWith(null);
    expect(record).not.toHaveBeenCalled(); expect(TestBed.inject(Router).url).toBe('/');
    fixture.destroy();
  });

  it('keeps mortality open and prevents cancel while submitting, then closes once on success', async () => {
    const pending = new Subject<unknown>(); record.mockReturnValue(pending);
    const { fixture, closed } = await render();
    const section = fixture.debugElement.query(By.directive(FlockMortalitySectionComponent)).componentInstance as FlockMortalitySectionComponent;
    section.form.setValue({ date: todayInLotsTimezone(), quantity: 1, reason: 'Lesión' }); section.submitForm();
    fixture.detectChanges(); section.closeForm(); fixture.componentInstance.close();
    expect(closed).not.toHaveBeenCalled(); expect(section.saving()).toBe(true);
    pending.next({}); fixture.detectChanges(); await fixture.whenStable();
    expect(closed).toHaveBeenCalledExactlyOnceWith('Mortandad registrada.');
    expect(TestBed.inject(Router).url).toBe('/'); fixture.destroy();
  });

  it('cancels a loading task and discards its pending response when destroyed', async () => {
    const pending = new Subject<Flock>(); getFlock.mockReturnValue(pending);
    const { fixture, closed } = await render();
    expect(fixture.nativeElement.querySelector('.task-status-dialog').open).toBe(true);
    fixture.nativeElement.querySelector('[aria-label="Cerrar tarea"]').click();
    expect(closed).toHaveBeenCalledWith(null); fixture.destroy();
    expect(pending.observed).toBe(false);
  });

  it('shows lookup errors in the modal and opens the form after retry', async () => {
    getFlock.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    const { fixture } = await render();
    expect(fixture.nativeElement.querySelector('.task-status-dialog').open).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Sin conexión');
    fixture.nativeElement.querySelector('button.primary').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.registration-dialog').open).toBe(true);
    fixture.destroy();
  });

  it('keeps feeding mounted until Ionic reports dismissal and reports a successful change', async () => {
    const { fixture, closed } = await render('feeding');
    const editor = fixture.debugElement.query(By.directive(FeedingEditorComponent)).componentInstance as FeedingEditorComponent;
    editor.submitted.emit({ mode: 'manual', recipeId: null, grams: '1250', reason: '' });
    fixture.detectChanges();
    expect(editor.open()).toBe(false); expect(closed).not.toHaveBeenCalled();
    editor.dismissed.emit(); expect(closed).toHaveBeenCalledExactlyOnceWith('Alimentación actualizada.');
    expect(TestBed.inject(Router).url).toBe('/'); fixture.destroy();
  });

  it('closes on identity changes and prevents further work under another actor', async () => {
    const { fixture, closed } = await render();
    actor.set({ id: 2 }); fixture.detectChanges();
    expect(closed).toHaveBeenCalledWith(null); fixture.destroy();
  });
});
