import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { ManagementPlansService } from '../../../management-plans/services/management-plans.service';
import { FlockHouseTaskRequest } from '../../interfaces/flock-house-task.interface';
import { HealthOperation } from '../../interfaces/flock-health.interface';
import { Flock } from '../../interfaces/flock.interface';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockHealthService } from '../../services/flock-health.service';
import { healthFlock, healthPlan } from '../../testing/health-fixtures';
import { HealthApplicationComponent } from '../health-application/health-application.component';
import { FlockHouseHealthDialogComponent } from './flock-house-health-dialog.component';

const request: FlockHouseTaskRequest = { kind: 'health', flockId: 'lot-1', origin: { unitId: 1, houseId: 3 },
  trigger: null, houseName: 'Galpón 3', unitName: 'San José' };
const operation: HealthOperation = { operation_id: 'op-1', medicine_application: { id: 'app-1' } };

describe('House health application', () => {
  const actor = signal({ id: 1, name: 'María', roles: ['admin'], permissions: [] as string[] });
  const session = signal<object | null>(null);
  const flock = vi.fn<FlockDetailService['flock']>();
  const record = vi.fn<FlockHealthService['record']>();
  const history = vi.fn<FlockHealthService['history']>();
  const catalogOptions = vi.fn<ManagementPlansService['catalogOptions']>();
  const flockPlan = vi.fn<ManagementPlansService['flockPlan']>();
  let restore: () => void;

  beforeEach(() => {
    restore = stubNativeDialog();
    actor.set({ id: 1, name: 'María', roles: ['admin'], permissions: [] }); session.set(null);
    flock.mockReset().mockReturnValue(of(healthFlock));
    record.mockReset().mockReturnValue(of(operation)); history.mockReset();
    catalogOptions.mockReset().mockImplementation(async (kind) => kind === 'medication'
      ? [{ value: 'medicine-1', label: 'Medicamento A' }] : [{ value: 'vaccine-1', label: 'Vacuna A' }]);
    flockPlan.mockReset().mockReturnValue(of({ data: healthPlan }));
    TestBed.configureTestingModule({ imports: [FlockHouseHealthDialogComponent], providers: [provideRouter([]),
      { provide: AuthStore, useValue: { user: actor, session } },
      { provide: FlockDetailService, useValue: { flock } },
      { provide: FlockHealthService, useValue: { record, history } },
      { provide: ManagementPlansService, useValue: { catalogOptions, flockPlan } },
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); restore(); });

  async function render(loaded = true) {
    const fixture = TestBed.createComponent(FlockHouseHealthDialogComponent);
    fixture.componentRef.setInput('request', request);
    const closed = vi.fn(); fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    if (loaded) await vi.waitFor(async () => {
      await fixture.whenStable(); fixture.detectChanges();
      const application = fixture.componentInstance.application;
      expect(application.dataReady() || application.dataError() || application.contextError()).toBeTruthy();
    });
    return { fixture, closed, root: fixture.nativeElement as HTMLElement };
  }

  it('opens the existing application modal directly, without history, navigation or writes on cancel', async () => {
    const { fixture, closed, root } = await render();
    expect(root.querySelector<HTMLDialogElement>('.health-dialog')?.open).toBe(true);
    expect(root.textContent).toContain('Lote L-024');
    expect(root.querySelector<HTMLDialogElement>('.task-status-dialog')?.open).toBe(false);
    expect(history).not.toHaveBeenCalled(); expect(flock).toHaveBeenCalledWith('lot-1');
    root.querySelector<HTMLButtonElement>('[aria-label="Cerrar aplicación"]')!.click();
    expect(closed).toHaveBeenCalledExactlyOnceWith(null); expect(record).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/'); fixture.destroy();
  });

  it('uses the existing outside-plan confirmation and preserves the request/key until confirmation succeeds', async () => {
    const pending = new Subject<HealthOperation>(); record.mockReturnValueOnce(pending);
    const { fixture, closed, root } = await render();
    const editor = fixture.debugElement.query(By.directive(HealthApplicationComponent)).componentInstance as HealthApplicationComponent;
    editor.setKind('medication');
    editor.form.patchValue({ product: 'medicine-1', reason: 'Tratamiento indicado' });
    editor.submit(); fixture.detectChanges();
    expect(root.querySelector<HTMLDialogElement>('.confirmation')?.open).toBe(true);
    expect(record).not.toHaveBeenCalled();
    editor.confirm(); fixture.detectChanges();
    editor.close(); fixture.componentInstance.close();
    expect(closed).not.toHaveBeenCalled(); expect(fixture.componentInstance.canLeave()).toBe(false);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toBe('lot-1');
    expect(record.mock.calls[0][1].body).toMatchObject({ medicine_id: 'medicine-1', reason: 'Tratamiento indicado' });
    expect(record.mock.calls[0][1].body).not.toHaveProperty('quantity');
    expect(record.mock.calls[0][1].body).not.toHaveProperty('plan_activity_id');
    pending.error(new HttpErrorResponse({ status: 0 })); await fixture.whenStable(); fixture.detectChanges();
    editor.close(); expect(closed).not.toHaveBeenCalled(); expect(fixture.componentInstance.canLeave()).toBe(false);
    editor.submit(); await fixture.whenStable(); fixture.detectChanges();
    expect(record.mock.calls[1]).toEqual(record.mock.calls[0]);
    expect(closed).toHaveBeenCalledExactlyOnceWith('Aplicación registrada.');
    expect(fixture.componentInstance.canLeave()).toBe(true); expect(history).not.toHaveBeenCalled(); fixture.destroy();
  });

  it.each([
    { ...healthFlock, poultry_house_id: 4 },
    { ...healthFlock, production_unit_id: 2 },
    { ...healthFlock, status: 'finished' as const },
  ])('blocks an application if the fresh lot no longer belongs to an eligible house context: %j', async (fresh) => {
    flock.mockReturnValue(of(fresh));
    const { fixture, root } = await render();
    expect(root.querySelector('.health-dialog')).toBeNull();
    expect(root.querySelector<HTMLDialogElement>('.task-status-dialog')?.open).toBe(true);
    expect(root.querySelector('[role="alert"]')?.textContent).toMatch(/cambió de galpón|finalizado/);
    expect(record).not.toHaveBeenCalled(); fixture.destroy();
  });

  it('keeps lookup errors in the dialog and retries without interpreting a failed plan as absent', async () => {
    flockPlan.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    const { fixture, root } = await render();
    expect(root.querySelector('.health-dialog')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Reintentá');
    root.querySelector<HTMLButtonElement>('button.primary')!.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector<HTMLDialogElement>('.health-dialog')?.open).toBe(true); fixture.destroy();
  });

  it('requires fresh context after a conflict and blocks a lot moved in the meantime', async () => {
    record.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    const { fixture, root } = await render();
    await fixture.componentInstance.application.save({ kind: 'medication', body: { medicine_id: 'medicine-1', occurred_at: '2026-10-20T10:00:00-03:00', reason: 'Motivo' } });
    expect(fixture.componentInstance.application.dataReady()).toBe(false);
    flock.mockReturnValue(of({ ...healthFlock, poultry_house_id: 4 }));
    await fixture.componentInstance.application.loadEditorData(); fixture.detectChanges(); await fixture.whenStable();
    expect(root.querySelector('.health-dialog')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('cambió de galpón');
    expect(record).toHaveBeenCalledTimes(1); fixture.destroy();
  });

  it('blocks users without execute permission before loading catalogs', async () => {
    actor.set({ id: 1, name: 'María', roles: [], permissions: ['management-plans.view'] });
    const { fixture, root } = await render();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No tenés permiso');
    expect(catalogOptions).not.toHaveBeenCalled(); expect(flock).not.toHaveBeenCalled(); fixture.destroy();
  });

  it('closes on session change and ignores the previous session’s pending lot lookup', async () => {
    const pending = new Subject<Flock>(); flock.mockReturnValue(pending);
    const { fixture, closed } = await render(false);
    session.set({ id: 'another-session' }); fixture.detectChanges();
    expect(closed).toHaveBeenCalledExactlyOnceWith(null);
    pending.next(healthFlock); pending.complete(); await fixture.whenStable();
    expect(fixture.componentInstance.application.flock()).toBeNull(); expect(record).not.toHaveBeenCalled(); fixture.destroy();
  });
});
