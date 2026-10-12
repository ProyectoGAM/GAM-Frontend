import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { MortalityChartComponent } from '../../components/mortality-chart/mortality-chart.component';
import { FlockMortalitySectionComponent } from '../../components/flock-mortality-section/flock-mortality-section.component';
import { flocksRoutes } from '../../flocks.routes';
import { Flock } from '../../interfaces/flock.interface';
import { FlockMortality, MortalityOperation } from '../../interfaces/flock-mortality.interface';
import { FlockDetailService, todayInLotsTimezone } from '../../services/flock-detail.service';
import { FlockMortalitiesService } from '../../services/flock-mortalities.service';
import { FlockDetailPage } from '../flock-detail/flock-detail.page';
import { FlockMortalitiesPage } from './flock-mortalities.page';

const id = '01J00000000000000000000000';
const prefix = '/administracion/lotes/lotes';
const flock: Flock = { id, code: 'L-024', breed_id: 1, supplier_id: null, supplier_name: null,
  origin: null, poultry_house_id: 3, production_unit_id: 1, initial_quantity: 100, current_quantity: 87,
  entry_date: '2026-09-01', established_at: '2026-09-01T12:00:00Z', age_days: 41, current_week: 6,
  is_grouped: false, status: 'active', version: 1, notes: null, finalized_at: null, finalization_reason: null };
const record: FlockMortality = { id: 'record-1', version: 2, quantity: 3,
  occurred_at: `${todayInLotsTimezone()}T12:00:00-03:00`, notes: 'Golpe de calor', status: 'recorded' };
const created: MortalityOperation = { operation_id: 'operation-1', mortality: { ...record, id: 'created-record' },
  flock: { id, current_quantity: 84, version: 2, status: 'active', finalized_at: null, finalization_reason: null } };
const cancelled: MortalityOperation = { operation_id: 'undo-operation', mortality: { ...record, status: 'cancelled', version: 3 },
  flock: { id, current_quantity: 90, version: 2, status: 'active', finalized_at: null, finalization_reason: null } };

function section(harness: RouterTestingHarness): FlockMortalitySectionComponent {
  const component = harness.routeDebugElement!.query(By.directive(FlockMortalitySectionComponent)).componentInstance as FlockMortalitySectionComponent;
  harness.routeNativeElement!.querySelectorAll('dialog').forEach((dialog) => { dialog.close = vi.fn(); dialog.showModal = vi.fn(); });
  return component;
}

describe('Mortality navigation', () => {
  const list = vi.fn<FlockMortalitiesService['list']>();
  const save = vi.fn<FlockMortalitiesService['record']>();
  const cancel = vi.fn<FlockMortalitiesService['cancel']>();
  const getFlock = vi.fn<FlockDetailService['flock']>();

  beforeEach(() => {
    list.mockReset();
    list.mockReturnValue(of([record]));
    save.mockReset(); save.mockReturnValue(of(created));
    cancel.mockReset(); cancel.mockReturnValue(of(cancelled));
    getFlock.mockReset(); getFlock.mockImplementation((flockId) => of({ ...flock, id: flockId }));
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'administracion/lotes/lotes', children: flocksRoutes }]),
      { provide: FlockDetailService, useValue: {
        flock: getFlock, mortalityTotal: () => of(13),
        latestWeighing: () => of(null), eggHistory: () => of(null), eggAverageLastSevenDays: () => of(null),
      } },
      { provide: FlockMortalitiesService, useValue: { list, record: save, cancel } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: () => of({ data: { name: 'Galpón 3' } }) } },
      { provide: AdminUnitContextService, useValue: { units: signal([{ id: 1, name: 'Unidad San José' }]) } },
    ] });
    TestBed.overrideComponent(MortalityChartComponent, { set: { template: '' } });
  });

  it('guards duplicate submits, closes only after API success and refreshes history and live balance', async () => {
    const result = new Subject<MortalityOperation>();
    save.mockReturnValueOnce(result);
    list.mockReturnValueOnce(of([record])).mockReturnValueOnce(of([record, created.mortality]));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness);
    form.openForm();
    form.form.setValue({ date: todayInLotsTimezone(), quantity: 3, reason: ' Golpe de calor ' });
    form.submitForm();
    harness.detectChanges();
    form.submitForm();
    expect(save).toHaveBeenCalledTimes(1);
    expect(page.saving()).toBe(true);
    const dialog = harness.routeNativeElement!.querySelector('dialog')!;
    expect(dialog.close).not.toHaveBeenCalled();
    expect(save.mock.calls[0][1]).toMatchObject({ version: 1, quantity: 3, notes: 'Golpe de calor' });
    result.next(created);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(page.flock()).toMatchObject({ current_quantity: 84, version: 2 });
    expect(form.leaders()[0].quantity).toBe(6);
    expect(page.success()).toBe('Mortalidad registrada.');
    expect(form.form.controls.reason.value).toBe('');
  });

  it('retries a lost response with exactly the same payload and idempotency key', async () => {
    save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 }))).mockReturnValueOnce(of(created));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness);
    form.form.setValue({ date: todayInLotsTimezone(), quantity: 3, reason: 'Golpe de calor' });
    form.submitForm();
    harness.detectChanges();
    expect(page.saveError()).toContain('Sin conexión');
    expect(form.form.controls.reason.value).toBe('Golpe de calor');
    form.submitForm();
    await harness.fixture.whenStable();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1]).toBe(save.mock.calls[0][1]);
    expect(save.mock.calls[1][2]).toBe(save.mock.calls[0][2]);
  });

  it('keeps backend validation next to the text field and preserves the draft after rejection', async () => {
    save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422,
      error: { errors: { notes: ['Revisá el motivo de la mortalidad.'] } } })));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness);
    form.form.setValue({ date: todayInLotsTimezone(), quantity: 3, reason: 'Golpe de calor' });
    form.submitForm();
    harness.detectChanges();
    expect(page.fieldErrors()).toEqual({ reason: 'Revisá el motivo de la mortalidad.' });
    expect(harness.routeNativeElement!.querySelector('#mortality-reason-error')?.textContent).toContain('Revisá el motivo');
    expect(form.form.controls.reason.value).toBe('Golpe de calor');
    expect(harness.routeNativeElement!.querySelector('dialog')!.close).not.toHaveBeenCalled();
  });

  it('refreshes a stale flock without losing the draft and requires confirmation against the new live balance', async () => {
    getFlock.mockReturnValueOnce(of(flock)).mockReturnValueOnce(of({ ...flock, current_quantity: 2, version: 7 }));
    save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409,
      error: { detail: 'La versión del lote cambió.' } }))).mockReturnValueOnce(of(created));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness);
    form.form.setValue({ date: todayInLotsTimezone(), quantity: 3, reason: 'Golpe de calor' });
    form.submitForm();
    harness.detectChanges();
    expect(page.flock()?.version).toBe(7);
    expect(form.form.controls.quantity.value).toBe(3);
    form.submitForm();
    expect(save).toHaveBeenCalledTimes(1);
    expect(form.pendingConfirmation()?.balance).toBe(2);
    form.confirmExcess();
    await harness.fixture.whenStable();
    expect(save.mock.calls[1][1].version).toBe(7);
    expect(save.mock.calls[1][2]).not.toBe(save.mock.calls[0][2]);
  });

  it('does not post an excess without confirmation or using confirmation of an outdated balance', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const draft = { date: todayInLotsTimezone(), quantity: 90, reason: 'Lesión' };
    page.saveMortality({ draft, excessConfirmation: null });
    page.saveMortality({ draft, excessConfirmation: { version: 1, balance: 88 } });
    expect(save).not.toHaveBeenCalled();
    expect(page.saveError()).toContain('cantidad viva actual');
  });

  it('keeps the original summary cards and opens the dedicated lazy page through Ir a mortalidad', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${prefix}/${id}`, FlockDetailPage);
    const detail = harness.routeNativeElement!;
    expect(detail.querySelector('#mortality-title')?.textContent).toBe('Mortalidad acumulada');
    expect(detail.querySelectorAll('.metric-grid > .small-card')).toHaveLength(2);
    expect(detail.querySelector('.metric-grid')?.textContent).toContain('13 aves');
    expect(detail.querySelector('app-flock-mortality-section')).toBeNull();
    expect(list).not.toHaveBeenCalled();
    const link = [...detail.querySelectorAll('a')].find((anchor) => anchor.textContent?.includes('Ir a mortalidad'))!;
    expect(link.getAttribute('href')).toBe(`${prefix}/${id}/mortalidad`);
    link.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    expect(page.querySelector('h1')?.textContent).toBe('Mortalidad del lote');
    expect(page.querySelector('.back-link')?.getAttribute('href')).toBe(`${prefix}/${id}`);
    expect(page.querySelector('tbody')?.textContent).toContain('Golpe de calor');
    expect(page.querySelector('#mortality-reason')?.tagName).toBe('TEXTAREA');
    expect(page.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);
    expect(list).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('supports a direct URL and retries history errors without confusing them with an empty flock', async () => {
    list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    expect(harness.routeNativeElement?.textContent).toContain('No tenés permiso para consultar la mortalidad');
    expect(harness.routeNativeElement?.querySelector('table')).toBeNull();
    (harness.routeNativeElement?.querySelector('.page-state button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('tbody')?.textContent).toContain('3 gallinas');
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('ignores late history from the previous flock when the route ID changes', async () => {
    const delayed = new Subject<FlockMortality[]>();
    const secondId = '01J00000000000000000000001';
    list.mockReturnValueOnce(delayed).mockReturnValueOnce(of([{ ...record, id: 'new-record', notes: 'Lesión' }]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const page = await harness.navigateByUrl(`${prefix}/${secondId}/mortalidad`, FlockMortalitiesPage);
    delayed.next([record]);
    harness.detectChanges();
    expect(page.flockId()).toBe(secondId);
    expect(page.records()[0].notes).toBe('Lesión');
    expect(harness.routeNativeElement?.querySelector('tbody')?.textContent).not.toContain('Golpe de calor');
    expect(harness.routeNativeElement?.querySelector('.back-link')?.getAttribute('href')).toBe(`${prefix}/${secondId}`);
  });

  it('never calls cancellation on dialog cancellation and removes the row and its deaths only after API success', async () => {
    const remaining = { ...record, id: 'remaining', quantity: 2, notes: 'Lesión' };
    list.mockReturnValueOnce(of([record, remaining])).mockReturnValueOnce(of([remaining]));
    const result = new Subject<MortalityOperation>(); cancel.mockReturnValueOnce(result);
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness);
    form.openCancellation(record); form.closeCancellation();
    expect(cancel).not.toHaveBeenCalled(); expect(page.records()).toHaveLength(2);
    form.openCancellation(record);
    form.cancellationForm.controls.reason.setValue(' Registro duplicado ');
    form.submitCancellation(); harness.detectChanges();
    form.submitCancellation();
    page.saveMortality({ draft: { date: todayInLotsTimezone(), quantity: 1, reason: 'Lesión' }, excessConfirmation: null });
    expect(cancel).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
    expect(cancel.mock.calls[0]).toEqual([record.id, { version: 2, flock_version: 1, reason: 'Registro duplicado' }, expect.any(String)]);
    expect(page.records()).toHaveLength(2); expect(page.flock()?.current_quantity).toBe(87);
    const dialog = harness.routeNativeElement!.querySelector<HTMLDialogElement>('[aria-labelledby="mortality-cancellation-title"]')!;
    expect(dialog.close).toHaveBeenCalledTimes(1); // Only the first cancelled confirmation.
    result.next(cancelled); await harness.fixture.whenStable(); harness.detectChanges();
    expect(page.flock()).toMatchObject({ current_quantity: 90, version: 2 });
    expect(page.records()).toEqual([remaining]);
    expect(form.points().reduce((sum, point) => sum + point.quantity, 0)).toBe(2);
    expect(harness.routeNativeElement!.querySelector('tbody')?.textContent).not.toContain('Golpe de calor');
    expect(page.success()).toContain('quedó auditada'); expect(dialog.close).toHaveBeenCalledTimes(2);
  });

  it('retries an uncertain cancellation with the same request and key while retaining the reason', async () => {
    cancel.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 }))).mockReturnValueOnce(of(cancelled));
    list.mockReturnValueOnce(of([record])).mockReturnValueOnce(of([]));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness); form.openCancellation(record);
    form.cancellationForm.controls.reason.setValue('Registro duplicado'); form.submitCancellation(); harness.detectChanges();
    expect(page.cancellationError()).toContain('Sin conexión');
    expect(page.records()).toEqual([record]); expect(form.cancellationForm.controls.reason.value).toBe('Registro duplicado');
    form.submitCancellation(); await harness.fixture.whenStable();
    expect(cancel.mock.calls[1][1]).toBe(cancel.mock.calls[0][1]);
    expect(cancel.mock.calls[1][2]).toBe(cancel.mock.calls[0][2]);
    expect(page.records()).toEqual([]);
  });

  it('refreshes both versions after a conflict, preserves the reason and requires another review before posting', async () => {
    getFlock.mockReturnValueOnce(of(flock)).mockReturnValueOnce(of({ ...flock, version: 7 }));
    list.mockReturnValueOnce(of([record])).mockReturnValueOnce(of([{ ...record, version: 5, quantity: 4 }]));
    cancel.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'El lote cambió.' } })));
    const result = new Subject<MortalityOperation>(); cancel.mockReturnValueOnce(result);
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness); form.openCancellation(record);
    form.cancellationForm.controls.reason.setValue('Error de carga'); form.submitCancellation(); harness.detectChanges();
    expect(page.flock()?.version).toBe(7); expect(page.records()[0].version).toBe(5);
    expect(form.cancellationForm.controls.reason.value).toBe('Error de carga');
    form.submitCancellation(); harness.detectChanges();
    expect(cancel).toHaveBeenCalledTimes(1); expect(form.cancellationDetails()?.quantity).toBe(4);
    expect(form.cancellationReviewError()).toContain('confirmá nuevamente');
    form.submitCancellation();
    expect(cancel.mock.calls[1][1]).toEqual({ version: 5, flock_version: 7, reason: 'Error de carga' });
    expect(cancel.mock.calls[1][2]).not.toBe(cancel.mock.calls[0][2]);
  });

  it('preserves the row and reason and displays backend validation beside the cancellation field', async () => {
    cancel.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422,
      error: { errors: { reason: ['Indicá el motivo de anulación.'] } } })));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness); form.openCancellation(record);
    form.cancellationForm.controls.reason.setValue('Error'); form.submitCancellation(); harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('#mortality-cancellation-error')?.textContent).toContain('Indicá el motivo');
    expect(page.records()).toEqual([record]); expect(page.flock()?.current_quantity).toBe(87);
    expect(form.cancellationForm.controls.reason.value).toBe('Error');
    const dialog = harness.routeNativeElement!.querySelector<HTMLDialogElement>('[aria-labelledby="mortality-cancellation-title"]')!;
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it.each([401, 403])('leaves the row intact when cancellation permission is denied (%s)', async (status) => {
    cancel.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness); form.openCancellation(record);
    form.cancellationForm.controls.reason.setValue('Registro duplicado'); form.submitCancellation();
    expect(page.cancellationError()).toContain('No tenés permiso'); expect(page.records()).toEqual([record]);
  });

  it('rejects stale versions, blank reasons and unconfirmed reactivation without a request', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    page.cancelMortality({ recordId: record.id, request: { version: 1, flock_version: 1, reason: 'Error' } });
    page.cancelMortality({ recordId: record.id, request: { version: 2, flock_version: 1, reason: ' ' } });
    page.flock.set({ ...flock, status: 'finished', current_quantity: 0 });
    page.cancelMortality({ recordId: record.id, request: { version: 2, flock_version: 1, reason: 'Error' } });
    expect(cancel).not.toHaveBeenCalled(); expect(page.cancellationError()).toContain('reactivación');
  });

  it('ignores a late cancellation response after navigating to another flock', async () => {
    const result = new Subject<MortalityOperation>(); cancel.mockReturnValueOnce(result);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${prefix}/${id}/mortalidad`, FlockMortalitiesPage);
    const form = section(harness); form.openCancellation(record);
    form.cancellationForm.controls.reason.setValue('Error'); form.submitCancellation();
    const secondId = 'second-lot';
    const page = await harness.navigateByUrl(`${prefix}/${secondId}/mortalidad`, FlockMortalitiesPage);
    result.next(cancelled); harness.detectChanges();
    expect(page.flock()?.id).toBe(secondId); expect(page.flock()?.current_quantity).toBe(87);
    expect(page.success()).toBeNull(); expect(page.records()).toEqual([record]);
  });
});
