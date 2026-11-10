import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ManagementPlansService } from '../../../management-plans/services/management-plans.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { HealthApplicationDraft, HealthOperation } from '../../interfaces/flock-health.interface';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockHealthService } from '../../services/flock-health.service';
import { healthFlock, healthPlan } from '../../testing/health-fixtures';
import { flocksRoutes } from '../../flocks.routes';
import { FlockHealthPage } from './flock-health.page';

describe('Flock health page', () => {
  const actor = signal({ id: 1, name: 'María', roles: ['admin'], permissions: [] as string[] });
  const history = vi.fn<FlockHealthService['history']>();
  const record = vi.fn<FlockHealthService['record']>();
  const flock = vi.fn<FlockDetailService['flock']>();
  const catalogOptions = vi.fn<ManagementPlansService['catalogOptions']>();
  const flockPlan = vi.fn<ManagementPlansService['flockPlan']>();
  const request: HealthApplicationDraft = { kind: 'medication', body: { medicine_id: 'medicine-1', reason: 'Motivo', occurred_at: '2026-10-20T10:00:00-03:00' } };
  const operation = { operation_id: 'op-1', medicine_application: { id: 'app-1' } };
  beforeEach(() => {
    actor.set({ id: 1, name: 'María', roles: ['admin'], permissions: [] });
    history.mockReset().mockReturnValue(of([]));
    record.mockReset().mockReturnValue(of(operation));
    flock.mockReset().mockReturnValue(of(healthFlock));
    catalogOptions.mockReset().mockResolvedValue([{ value: 'medicine-1', label: 'Medicamento A' }]);
    flockPlan.mockReset().mockReturnValue(of({ data: healthPlan }));
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'administracion/lotes/lotes', children: flocksRoutes }]),
      { provide: AuthStore, useValue: { user: actor, session: signal(null) } },
      { provide: FlockHealthService, useValue: { history, record } },
      { provide: FlockDetailService, useValue: { flock } },
      { provide: ManagementPlansService, useValue: { catalogOptions, flockPlan } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: () => of({ data: { name: 'Galpón 3' } }) } },
      { provide: AdminUnitContextService, useValue: { units: signal([{ id: 1, name: 'San José' }]) } },
    ] });
  });
  async function setup() {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/administracion/lotes/lotes/lot-1/sanidad?lotFrom=house&unitId=1&houseId=3', FlockHealthPage);
    await harness.fixture.whenStable(); harness.detectChanges();
    for (const dialog of harness.routeNativeElement!.querySelectorAll('dialog')) {
      dialog.showModal = vi.fn(() => { dialog.open = true; });
      dialog.close = vi.fn(() => { dialog.open = false; });
    }
    return { harness, page };
  }
  it('loads history and preserves the detail origin, without writing on entry', async () => {
    const { page, harness } = await setup();
    expect(history).toHaveBeenCalledWith('lot-1');
    expect(record).not.toHaveBeenCalled();
    expect(harness.routeNativeElement!.textContent).toContain('Este lote aún no tiene aplicaciones');
    expect(page.backQuery()).toEqual({ lotFrom: 'house', unitId: '1', houseId: '3' });
  });
  it('blocks duplicate saves and replays the exact request/key after an uncertain response', async () => {
    const pending = new Subject<HealthOperation>(); record.mockReturnValueOnce(pending);
    const { page, harness } = await setup();
    page.openApplication(); await harness.fixture.whenStable();
    const saving = page.save(request);
    await page.save(request);
    expect(record).toHaveBeenCalledTimes(1);
    expect(page.canLeave()).toBe(false);
    pending.error(new HttpErrorResponse({ status: 0 }));
    await saving; await harness.fixture.whenStable();
    expect(page.uncertain()).toBe(true);
    await page.retry(); await harness.fixture.whenStable();
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1]).toEqual(record.mock.calls[0]);
    expect(page.success()).toBe('Aplicación registrada.');
    expect(history).toHaveBeenCalledTimes(2);
    expect(page.canLeave()).toBe(true);
  });
  it('shows backend validation and refreshes context after a plan conflict', async () => {
    record.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { reason: ['Indicá un motivo.'] } } })));
    const { page, harness } = await setup();
    page.openApplication(); await harness.fixture.whenStable(); await page.save(request);
    expect(page.actionError()).toBe('Indicá un motivo.');
    expect(page.uncertain()).toBe(false);
    record.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    await page.save(request);
    expect(page.dataReady()).toBe(false);
    expect(page.dataError()).toContain('Actualizá');
    await page.save(request); expect(record).toHaveBeenCalledTimes(2);
    await page.loadEditorData(); expect(page.dataReady()).toBe(true);
  });
  it('clears identity data and ignores an old application response', async () => {
    const pending = new Subject<HealthOperation>(); record.mockReturnValueOnce(pending);
    const { page, harness } = await setup();
    page.openApplication(); await harness.fixture.whenStable();
    const saving = page.save(request);
    actor.set({ id: 2, name: 'Diego', roles: [], permissions: ['management-plans.view'] });
    await harness.fixture.whenStable(); pending.next(operation); pending.complete(); await saving;
    expect(page.success()).toBeNull();
    expect(page.canApply()).toBe(false);
    expect(page.dataReady()).toBe(false);
  });
  it('enforces history permissions and read-only access for finished lots', async () => {
    actor.set({ id: 1, name: 'María', roles: [], permissions: [] });
    const { page, harness } = await setup();
    expect(page.state()).toBe('forbidden'); expect(history).not.toHaveBeenCalled();
    flock.mockReturnValue(of({ ...healthFlock, status: 'finished' }));
    actor.set({ id: 1, name: 'María', roles: ['admin'], permissions: [] });
    await harness.fixture.whenStable();
    expect(page.canApply()).toBe(false);
    expect(harness.routeNativeElement!.textContent).toContain('Lote finalizado');
    await page.save(request); expect(record).not.toHaveBeenCalled();
  });
  it('permits an absent plan but never treats a failed plan lookup as outside-plan eligibility', async () => {
    flockPlan.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })));
    const { page, harness } = await setup();
    page.openApplication(); await harness.fixture.whenStable();
    expect(page.dataReady()).toBe(true); expect(page.plan()).toBeNull();
    flockPlan.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    await page.loadEditorData();
    expect(page.dataReady()).toBe(false);
    await page.save(request); expect(record).not.toHaveBeenCalled();
  });
});
