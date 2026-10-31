import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { CollectionChartComponent } from '../../components/collection-chart/collection-chart.component';
import { CollectionFormComponent } from '../../components/collection-form/collection-form.component';
import { flocksRoutes } from '../../flocks.routes';
import { CollectionOperation, CollectionPage, FlockCollection } from '../../interfaces/flock-collection.interface';
import { EggMetricDay } from '../../interfaces/flock-detail.interface';
import { Flock } from '../../interfaces/flock.interface';
import { collectionSummary } from '../../services/collection-summary';
import { FlockCollectionsService } from '../../services/flock-collections.service';
import { FlockFeedingService } from '../../services/flock-feeding.service';
import { dateBefore, FlockDetailService, todayInLotsTimezone } from '../../services/flock-detail.service';
import { FlockDetailPage } from '../flock-detail/flock-detail.page';
import { FlockStatusService } from '../../services/flock-status.service';
import { FlockCollectionsPage } from './flock-collections.page';

const today = todayInLotsTimezone();
const id = '01J00000000000000000000000';
const prefix = '/administracion/lotes/lotes';
const flock: Flock = { id, code: 'L-024', breed_id: 1, supplier_id: null, supplier_name: null,
  origin: null, poultry_house_id: 3, production_unit_id: 1, initial_quantity: 100, current_quantity: 87,
  entry_date: dateBefore(today, 90), established_at: `${dateBefore(today, 90)}T12:00:00Z`, age_days: 90, current_week: 13,
  is_grouped: false, status: 'active', version: 1, notes: null, finalized_at: null, finalization_reason: null };
const record: FlockCollection = { id: 'record', flock_id: id, version: 1, quantity: 400, occurred_at: `${dateBefore(today, 1)}T16:40:00-03:00`, notes: '<b>Sin interpretar HTML</b>', status: 'recorded' };
const metricDays: EggMetricDay[] = [{ date: dateBefore(today, 1), quantity: 400 }, { date: dateBefore(today, 40), quantity: 300 }];
const historyPage: CollectionPage = { data: [record], meta: { current_page: 1, last_page: 2, total: 2 } };
const operation: CollectionOperation = { operation_id: 'operation', collection: { ...record, id: 'created' } };

describe('Flock collection behavior', () => {
  const history = vi.fn<FlockCollectionsService['history']>();
  const days = vi.fn<FlockCollectionsService['days']>();
  const save = vi.fn<FlockCollectionsService['record']>();
  const getFlock = vi.fn<FlockDetailService['flock']>();
  const user = signal({ roles: ['admin'], permissions: [] as string[] });

  beforeEach(() => {
    history.mockReset(); history.mockReturnValue(of(historyPage));
    days.mockReset(); days.mockReturnValue(of(metricDays));
    save.mockReset(); save.mockReturnValue(of(operation));
    getFlock.mockReset(); getFlock.mockImplementation((flockId) => of({ ...flock, id: flockId }));
    user.set({ roles: ['admin'], permissions: [] });
    TestBed.configureTestingModule({ providers: [
      { provide: FlockStatusService, useValue: {} },
      provideRouter([{ path: 'administracion/lotes/lotes', children: flocksRoutes }]),
      { provide: AuthStore, useValue: { user, session: signal(null), isAdmin: () => user().roles.includes('admin') } },
      { provide: FlockDetailService, useValue: { flock: getFlock, mortalityTotal: () => of(0), latestWeighing: () => of(null) } },
      { provide: FlockFeedingService, useValue: { overview: () => of(null) } },
      { provide: FlockCollectionsService, useValue: { history, days, record: save, summary: () => of(collectionSummary(metricDays, flock.entry_date, today)) } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: () => of({ data: { name: 'Galpón 3' } }) } },
      { provide: AdminUnitContextService, useValue: { units: signal([{ id: 1, name: 'Unidad San José' }]) } },
    ] });
    TestBed.overrideComponent(CollectionChartComponent, { set: { template: '' } });
  });

  async function setup(): Promise<{ harness: RouterTestingHarness; page: FlockCollectionsPage; form: CollectionFormComponent }> {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/recoleccion`, FlockCollectionsPage);
    await harness.fixture.whenStable(); harness.detectChanges();
    harness.routeNativeElement!.querySelectorAll('dialog').forEach((dialog) => { dialog.showModal = vi.fn(); dialog.close = vi.fn(); });
    const form = harness.routeDebugElement!.query(By.directive(CollectionFormComponent)).componentInstance as CollectionFormComponent;
    return { harness, page, form };
  }

  it('links details to collection and back without showing charts in details', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${prefix}/${id}`, FlockDetailPage);
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(`a[href$='/recoleccion']`)!;
    expect(link.textContent).toContain('Ir a postura');
    expect(harness.routeNativeElement!.querySelector('app-collection-chart')).toBeNull();
    expect(harness.routeNativeElement!.textContent).not.toContain('Registrar postura');
    await harness.navigateByUrl(link.getAttribute('href')!, FlockCollectionsPage);
    expect(harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.back-link')!.getAttribute('href')).toBe(`${prefix}/${id}`);
  });

  it('changes graph windows while keeping summary and full historical table independent', async () => {
    const { harness, page } = await setup();
    const originalSummary = page.summary();
    const firstHistoricalDate = dateBefore(today, 40);
    const chart = harness.routeDebugElement!.query(By.directive(CollectionChartComponent)).componentInstance as CollectionChartComponent;
    expect(chart.firstHistoricalDate()).toBe(firstHistoricalDate);
    expect(page.points()).toHaveLength(7);
    expect(page.points().some((point) => point.date === firstHistoricalDate)).toBe(false);
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.segments button:nth-child(2)')!.click();
    harness.detectChanges();
    expect(page.points()).toHaveLength(7);
    expect(page.grouping()).toBe('week');
    expect(chart.firstHistoricalDate()).toBe(firstHistoricalDate);
    expect(page.range().from).toBe(firstHistoricalDate);
    expect(page.points()[0]).toMatchObject({ date: firstHistoricalDate, quantity: 300 });
    expect(harness.routeNativeElement!.textContent).toContain('Últimos 3 meses');
    page.changePeriod('history');
    harness.detectChanges();
    expect(page.points()).toHaveLength(7);
    expect(page.points()[0].date).toBe(firstHistoricalDate);
    expect(page.range().from).toBe(firstHistoricalDate);
    expect(chart.firstHistoricalDate()).toBe(firstHistoricalDate);
    expect(page.points().find((point) => point.date === firstHistoricalDate)?.quantity).toBe(300);
    expect(page.points().filter((point) => point.quantity !== null)).toHaveLength(2);
    expect(page.summary()).toEqual(originalSummary);
    expect(history).toHaveBeenCalledTimes(1);
    expect(harness.routeNativeElement!.querySelector('.summary-heading + .segments')).toBeNull();
    expect(harness.routeNativeElement!.textContent).not.toContain('Acumulada');
    const chartSection = harness.routeNativeElement!.querySelector('app-collection-chart')!.closest('section')!;
    expect(chartSection.querySelector('.segments')).not.toBeNull();
  });

  it('allows keyboard date lookup including days without collections', async () => {
    const { harness, page } = await setup();
    const select = harness.routeNativeElement!.querySelector<HTMLSelectElement>('#collection-point-date')!;
    expect(select.value).toBe(dateBefore(today, 1));
    select.value = dateBefore(today, 2);
    select.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(page.selected()?.quantity).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.selected-point')!.textContent).toContain('Sin registro');
    page.changePeriod('history'); harness.detectChanges();
    expect(select.value).toBe(today);
    expect(page.selected()?.dayCount).toBe(5);
    expect(harness.routeNativeElement!.querySelector('.selected-point')!.textContent).toContain('80 huevos/día');
  });

  it('switches long production histories to monthly means and preserves the green reference', async () => {
    const { harness, page } = await setup();
    const first = dateBefore(today, 250);
    page.flock.set({ ...flock, entry_date: dateBefore(today, 270) });
    page.days.set([{ date: first, quantity: 140 }, { date: dateBefore(today, 1), quantity: 400 }]);
    page.changePeriod('history'); harness.detectChanges();
    expect(page.grouping()).toBe('month');
    expect(page.points()[0]).toMatchObject({ date: first, quantity: 140, dayCount: 1 });
    expect(page.points().length).toBeLessThan(12);
    expect(harness.routeNativeElement!.textContent).toContain('Promedios mensuales');
    const select = harness.routeNativeElement!.querySelector<HTMLSelectElement>('#collection-point-date')!;
    select.value = first; select.dispatchEvent(new Event('change')); harness.detectChanges();
    expect(page.selectedQuantity()).toBe('140 huevos/día');
  });

  it('keeps existing rows on a failed next-page request and retries the same page', async () => {
    history.mockReturnValueOnce(of(historyPage)).mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(of({ data: [{ ...record, id: 'older', status: 'cancelled' }], meta: { current_page: 2, last_page: 2, total: 2 } }));
    const { page } = await setup();
    page.loadHistory(true);
    expect(page.records()).toEqual([record]);
    expect(page.moreError()).toBeTruthy();
    page.loadHistory(true);
    expect(history.mock.calls.slice(1).map((call) => call[1])).toEqual([2, 2]);
    expect(page.records()).toHaveLength(2);
    expect(page.currentPage()).toBe(2);
  });

  it('shows record notes as text and distinguishes cancelled entries', async () => {
    history.mockReturnValue(of({ ...historyPage, data: [{ ...record, status: 'cancelled' }] }));
    const { harness, page } = await setup();
    page.openRecord(page.records()[0]); harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.record-dialog .notes')!.textContent).toBe(record.notes);
    expect(harness.routeNativeElement!.querySelector('.record-dialog b')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('tbody')!.textContent).toContain('Cancelada');
  });

  it('blocks duplicate submits, closes after success and refreshes production and history', async () => {
    const pending = new Subject<CollectionOperation>();
    save.mockReturnValueOnce(pending);
    const { harness, page, form } = await setup();
    form.form.setValue({ quantity: 420, occurredAt: '', notes: ' Nota ' });
    form.openForm(); form.submit(); harness.detectChanges(); form.submit();
    expect(save).toHaveBeenCalledTimes(1);
    expect(page.saving()).toBe(true);
    const dialog = harness.routeNativeElement!.querySelector<HTMLDialogElement>('app-collection-form dialog')!;
    expect(dialog.close).not.toHaveBeenCalled();
    pending.next(operation); harness.detectChanges();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(form.form.controls.quantity.value).toBeNull();
    expect(days).toHaveBeenCalledTimes(2);
    expect(history).toHaveBeenCalledTimes(2);
  });

  it('reuses the exact payload and idempotency key after a lost response', async () => {
    save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 }))).mockReturnValueOnce(of(operation));
    const { harness, page, form } = await setup();
    form.form.setValue({ quantity: 420, occurredAt: '', notes: ' Nota ' });
    form.submit(); harness.detectChanges();
    expect(page.saveError()).toContain('Sin conexión');
    expect(form.form.controls.quantity.value).toBe(420);
    form.submit();
    expect(save.mock.calls[1][1]).toBe(save.mock.calls[0][1]);
    expect(save.mock.calls[1][2]).toBe(save.mock.calls[0][2]);
  });

  it('preserves backend validation errors beside fields and does not close the draft', async () => {
    save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { quantity: ['Cantidad inválida.'] } } })));
    const { harness, page, form } = await setup();
    form.form.setValue({ quantity: 420, occurredAt: '', notes: '' });
    form.submit(); harness.detectChanges();
    expect(page.fieldErrors()).toEqual({ quantity: 'Cantidad inválida.' });
    expect(harness.routeNativeElement!.querySelector('#collection-quantity-error')!.textContent).toContain('Cantidad inválida');
    expect(form.form.controls.quantity.value).toBe(420);
    expect(harness.routeNativeElement!.querySelector<HTMLDialogElement>('app-collection-form dialog')!.close).not.toHaveBeenCalled();
  });

  it('refreshes a conflict without clearing the form and blocks collection when the lot has no birds', async () => {
    getFlock.mockReturnValueOnce(of(flock)).mockReturnValueOnce(of({ ...flock, current_quantity: 0 }));
    save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'El lote no tiene aves.' } })));
    const { harness, page, form } = await setup();
    form.form.setValue({ quantity: 420, occurredAt: '', notes: '' }); form.submit(); harness.detectChanges();
    expect(page.canCollect()).toBe(false);
    expect(form.form.controls.quantity.value).toBe(420);
    form.submit();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports production failure without inventing zeros and can reload only that section', async () => {
    days.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 }))).mockReturnValueOnce(of(metricDays));
    const { harness, page } = await setup();
    expect(page.summary().state).toBe('unavailable');
    expect(page.records()).toHaveLength(1);
    page.loadMetrics(); harness.detectChanges();
    expect(page.summary().state).toBe('ready');
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('disables collection for users lacking permission and for finished lots', async () => {
    user.set({ roles: [], permissions: ['egg-collections.view'] });
    const { page, form } = await setup();
    expect(page.canCollect()).toBe(false);
    form.form.setValue({ quantity: 20, occurredAt: '', notes: '' }); form.submit();
    expect(save).not.toHaveBeenCalled();
    user.set({ roles: ['admin'], permissions: [] });
    page.flock.set({ ...flock, status: 'finished' });
    expect(page.canCollect()).toBe(false);
  });

  it('ignores old metric and history responses when navigating to another lot', async () => {
    const oldDays = new Subject<EggMetricDay[]>();
    const oldHistory = new Subject<CollectionPage>();
    days.mockReturnValueOnce(oldDays).mockReturnValueOnce(of([]));
    history.mockReturnValueOnce(oldHistory).mockReturnValueOnce(of({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }));
    const { harness } = await setup();
    const current = await harness.navigateByUrl(`${prefix}/another/recoleccion`, FlockCollectionsPage);
    oldDays.next(metricDays); oldHistory.next(historyPage);
    expect(current.flock()?.id).toBe('another');
    expect(current.days()).toEqual([]); expect(current.records()).toEqual([]);
  });
});
