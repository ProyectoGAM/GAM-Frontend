import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { FlockMortalitySectionComponent } from '../components/flock-mortality-section/flock-mortality-section.component';
import { Flock } from '../interfaces/flock.interface';
import { FlockDetailService, todayInLotsTimezone } from '../services/flock-detail.service';
import { FlockFeedingService } from '../services/flock-feeding.service';
import { FlockMortalitiesService } from '../services/flock-mortalities.service';
import { FlockWeighingsService } from '../services/flock-weighings.service';
import { FlockFeedingPage } from './flock-feeding/flock-feeding.page';
import { FlockMortalitiesPage } from './flock-mortalities/flock-mortalities.page';
import { FlockWeighingsPage } from './flock-weighings/flock-weighings.page';

@Component({ template: 'Galpón de origen' })
class HouseDestinationPage {}

const prefix = '/administracion/lotes/lotes/lot-1';
const query = '?lotFrom=house&unitId=7&houseId=22&task=entry';
const houseUrl = '/administracion/unidades-productivas/7/galpon/22';
const flock: Flock = { id: 'lot-1', code: 'L-001', poultry_house_id: 22, production_unit_id: 7,
  status: 'active', current_quantity: 100, version: 1, entry_date: '2026-01-01', established_at: '2026-01-01T12:00:00Z' } as Flock;

describe('tasks opened from a house', () => {
  const getFlock = vi.fn(() => of(flock));
  const list = vi.fn(() => of([]));
  const record = vi.fn(() => of({ flock: { ...flock, current_quantity: 99, version: 2 } }));
  const history = vi.fn(() => of({ data: [], next_cursor: null }));
  const consumptions = vi.fn(() => of([]));
  const addEntry = vi.fn(() => of({}));
  const showModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks(); getFlock.mockReturnValue(of(flock));
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() });
    TestBed.configureTestingModule({ providers: [
      provideRouter([
        { path: 'administracion/lotes/lotes/:id/pesajes', component: FlockWeighingsPage },
        { path: 'administracion/lotes/lotes/:id/mortalidad', component: FlockMortalitiesPage },
        { path: 'administracion/lotes/lotes/:id/alimentacion', component: FlockFeedingPage },
        { path: 'administracion/unidades-productivas/:id/galpon/:houseId', component: HouseDestinationPage },
      ]),
      { provide: FlockDetailService, useValue: { flock: getFlock } },
      { provide: FlockMortalitiesService, useValue: { list, record } },
      { provide: FlockWeighingsService, useValue: { listDaily: history, addDailyEntry: addEntry,
        getDailyByDate: () => throwError(() => new HttpErrorResponse({ status: 404 })) } },
      { provide: FlockFeedingService, useValue: { current: () => of({ id: 1, modo: 'automatico', receta_id: 1, cantidad_diaria_g: '1000', finalizado: false }),
        balances: () => of([]), consumptions } },
      { provide: AuthStore, useValue: { user: signal({ id: 1, name: 'Operador' }) } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: () => of({ data: { name: 'Galpón 22' } }) } },
      { provide: AdminUnitContextService, useValue: { units: signal([{ id: 7, name: 'UP 7' }]) } },
    ] });
  });

  it('opens weighing entry directly and stays there after saving an individual or group', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/pesajes${query}`, FlockWeighingsPage);
    expect(page.tab()).toBe('entry'); expect(history).not.toHaveBeenCalled();
    expect(harness.routeNativeElement!.querySelector('#summary-panel')).toBeNull();
    page.individualWeight.setValue('1850'); page.submitEntry();
    page.setEntryMode('group'); page.groupCount.setValue('2'); page.groupTotal.setValue('3700'); page.submitEntry();
    expect(addEntry).toHaveBeenCalledTimes(2); expect(page.tab()).toBe('entry');
    expect(page.backLink()).toBe(houseUrl);
  });

  it('opens the existing mortality dialog and returns after successful registration', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${prefix}/mortalidad${query}`, FlockMortalitiesPage);
    expect(showModal).toHaveBeenCalled(); expect(list).not.toHaveBeenCalled();
    const section = harness.routeDebugElement!.query(By.directive(FlockMortalitySectionComponent)).componentInstance as FlockMortalitySectionComponent;
    expect(section.registrationOnly()).toBe(true);
    section.form.setValue({ date: todayInLotsTimezone(), quantity: 1, reason: 'Motivo de prueba' }); section.submitForm();
    await harness.fixture.whenStable();
    expect(record).toHaveBeenCalledOnce(); expect(TestBed.inject(Router).url).toBe(houseUrl);
    expect(TestBed.inject(Router).lastSuccessfulNavigation()?.extras.state?.['flockTaskMessage']).toBe('Mortandad registrada.');
  });

  it('returns to the house on mortality cancellation', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${prefix}/mortalidad${query}`, FlockMortalitiesPage);
    const section = harness.routeDebugElement!.query(By.directive(FlockMortalitySectionComponent)).componentInstance as FlockMortalitySectionComponent;
    section.closeForm(); await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(houseUrl); expect(record).not.toHaveBeenCalled();
  });

  it('opens the feeding editor directly and returns after dismissal without loading consumption charts', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(`${prefix}/alimentacion${query}`, FlockFeedingPage);
    expect(page.editorOpen()).toBe(true); expect(page.editor()).toBe('manual');
    expect(consumptions).not.toHaveBeenCalled();
    expect(harness.routeNativeElement!.querySelector('.overview-grid')).toBeNull();
    page.closeEditor(); page.editorDismissed(); await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(houseUrl);
  });

  it.each(['pesajes', 'mortalidad', 'alimentacion'])('blocks %s when the lot moved to another house', async (path) => {
    getFlock.mockReturnValue(of({ ...flock, poultry_house_id: 23 }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${prefix}/${path}${query}`);
    expect(harness.routeNativeElement!.textContent).toContain('El lote cambió de galpón');
    expect(showModal).not.toHaveBeenCalled(); expect(addEntry).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
  });
});
