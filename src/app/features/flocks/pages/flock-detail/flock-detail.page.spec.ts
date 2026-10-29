import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FlockStatusService } from '../../services/flock-status.service';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FlockFeedingOverview } from '../../interfaces/flock-feeding.interface';
import { Flock } from '../../interfaces/flock.interface';
import { FlockCollectionsService } from '../../services/flock-collections.service';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockFeedingService } from '../../services/flock-feeding.service';
import { FlockDetailPage } from './flock-detail.page';

const flock = { id: 'lot-1', code: 'LOT-FEED-TEST', production_unit_id: 7, poultry_house_id: 3,
  status: 'active', entry_date: '2026-10-01', age_days: 14, current_quantity: 120, version: 2, is_grouped: true } as Flock;
const overview: FlockFeedingOverview = {
  current: { id: 10, lote_id: flock.id, modo: 'manual', receta_id: 1, cantidad_diaria_g: '20000',
    cantidad_manual_g: '20000', edad_dias: 15, fecha_vigencia: '2026-10-14',
    etapa: { recipe_id: 1, recipe_snapshot: { name: 'Pollitos bb 1' } }, finalizado: false },
  recipeName: 'Pollitos bb 1', scheduleAvailable: true, nextChange: { date: '2026-10-20', day: 20 },
};

describe('FlockDetailPage feeding overview', () => {
  const changeStatus = vi.fn<FlockStatusService['change']>();
  const finalize = vi.fn<FlockStatusService['finalize']>();
  const user = signal({ id: 1, roles: ['admin'], permissions: [] as string[] });
  const loadOverview = vi.fn<FlockFeedingService['overview']>();
  let queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    queryParamMap = new BehaviorSubject(convertToParamMap({}));
    loadOverview.mockReset().mockReturnValue(of(overview));
    changeStatus.mockReset();
    finalize.mockReset();
    user.set({ id: 1, roles: ['admin'], permissions: [] });
    TestBed.configureTestingModule({ imports: [FlockDetailPage], providers: [provideRouter([]),
      { provide: AuthStore, useValue: { user, session: signal(null) } },
      { provide: FlockStatusService, useValue: { change: changeStatus, finalize } },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: flock.id })), queryParamMap } },
      { provide: FlockDetailService, useValue: {
        flock: () => of(flock), mortalityTotal: () => of(0), latestWeighing: () => of(null),
      } },
      { provide: FlockFeedingService, useValue: { overview: loadOverview } },
      { provide: FlockCollectionsService, useValue: { summary: () => of(null) } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: () => of({ data: { name: 'Galpón 3' } }) } },
      { provide: AdminUnitContextService, useValue: { units: signal([{ id: 7, name: 'UP San José' }]) } },
    ] });
  });

  const setup = async () => {
    const fixture = TestBed.createComponent(FlockDetailPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = vi.fn(); dialog.close = vi.fn();
    return { fixture, page: fixture.componentInstance,
      card: fixture.nativeElement.querySelector('.feeding-card') as HTMLElement };
  };

  it('requires a reason, prevents duplicate submissions and updates the badge from the saved snapshot', async () => {
    const { fixture, page } = await setup();
    const pending = new Subject<ReturnType<typeof statusResult>>();
    changeStatus.mockReturnValue(pending);
    page.openStatusEditor();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-choice.selected input').value).toBe('active');
    page.statusForm.controls.status.setValue('quarantined');
    page.saveStatus();
    expect(changeStatus).not.toHaveBeenCalled();
    page.statusForm.controls.reason.setValue('  Observación sanitaria  ');
    page.saveStatus(); page.saveStatus();
    expect(changeStatus).toHaveBeenCalledExactlyOnceWith(flock.id, { version: 2, status: 'quarantined', reason: 'Observación sanitaria' }, expect.any(String));
    expect(page.flock()?.status).toBe('active');
    pending.next(statusResult()); fixture.detectChanges();
    expect(page.flock()).toMatchObject({ status: 'quarantined', version: 3, is_grouped: true });
    expect(fixture.nativeElement.querySelector('.status-badge').textContent).toContain('En cuarentena');
    expect(page.statusSuccess()).toContain('actualizado');
  });

  function statusResult() {
    const snapshot = { ...flock, status: 'quarantined' as const, version: 3 };
    Reflect.deleteProperty(snapshot, 'is_grouped');
    return { operation_id: 'operation', flock: snapshot };
  }

  const finalizationResult = () => ({ operation_id: 'finalized', flock: { ...flock, status: 'finished' as const,
    current_quantity: 0, version: 3, finalized_at: '2026-10-29T12:00:00Z', finalization_reason: 'Fin del ciclo' } });

  it.each(['active', 'quarantined'] as const)('opens with the current %s state checked and requires a different state before saving', async (status) => {
    const { fixture, page } = await setup();
    page.flock.set({ ...flock, status }); page.openStatusEditor(); fixture.detectChanges();
    const selected = fixture.nativeElement.querySelector('.status-choice.selected') as HTMLLabelElement;
    expect(selected.classList.contains(status === 'active' ? 'active-choice' : 'quarantine-choice')).toBe(true);
    expect(selected.querySelector('input')?.checked).toBe(true);
    expect(selected.querySelector('input')?.value).toBe(status);
    expect((fixture.nativeElement.querySelector('.status-primary') as HTMLButtonElement).disabled).toBe(true);
    page.statusForm.controls.reason.setValue('Sin cambio'); page.saveStatus();
    expect(changeStatus).not.toHaveBeenCalled(); expect(finalize).not.toHaveBeenCalled();
    page.statusForm.controls.status.setValue(status === 'active' ? 'quarantined' : 'active'); fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.status-primary') as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['active', 'quarantined'] as const)('finalizes a %s flock only after a reason and explicit confirmation', async (status) => {
    const { fixture, page } = await setup();
    page.flock.set({ ...flock, status }); page.openStatusEditor();
    page.statusForm.controls.status.setValue('finished'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#finalization-impact').textContent).toContain('egreso de 120 aves');
    expect(fixture.nativeElement.querySelector('#status-title').textContent).toBe('Finalizar lote');
    expect(fixture.nativeElement.querySelector('.flock-context').textContent).toContain(flock.code);
    expect(fixture.nativeElement.querySelector('input[type="radio"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="checkbox"]').checked).toBe(false);
    expect(fixture.nativeElement.querySelector('.finalize-button').textContent).toContain('Finalizar lote');
    page.saveStatus(); expect(finalize).not.toHaveBeenCalled();
    page.statusForm.controls.reason.setValue(' Fin del ciclo ');
    page.saveStatus(); expect(finalize).not.toHaveBeenCalled();
    page.statusForm.controls.confirmFinalization.setValue(true);
    const pending = new Subject<ReturnType<typeof finalizationResult>>(); finalize.mockReturnValue(pending);
    page.saveStatus(); page.saveStatus();
    expect(finalize).toHaveBeenCalledExactlyOnceWith(flock.id, { version: 2, reason: 'Fin del ciclo' }, expect.any(String));
    expect(changeStatus).not.toHaveBeenCalled(); expect(page.flock()?.status).toBe(status);
    pending.next(finalizationResult()); fixture.detectChanges();
    expect(page.flock()).toMatchObject({ status: 'finished', current_quantity: 0, version: 3 });
    expect(page.canFractionate()).toBe(false); expect(page.liveBirdsText()).toBe('0');
    expect(fixture.nativeElement.querySelector('.status-badge').textContent).toContain('Finalizado');
    expect(page.statusSuccess()).toContain('Lote finalizado');
    expect(loadOverview).toHaveBeenCalledTimes(2);
  });

  it('retries an uncertain finalization with its original body and key', async () => {
    const { page } = await setup();
    finalize.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 }))).mockReturnValueOnce(of(finalizationResult()));
    page.openStatusEditor(); page.statusForm.setValue({ status: 'finished', reason: 'Fin del ciclo', confirmFinalization: true });
    page.saveStatus(); expect(page.statusUncertain()).toBe(true);
    page.backToStatusChoices(); expect(page.statusForm.controls.status.value).toBe('finished');
    page.saveStatus();
    expect(finalize.mock.calls[1]).toEqual(finalize.mock.calls[0]);
    expect(page.flock()?.status).toBe('finished'); expect(changeStatus).not.toHaveBeenCalled();
  });

  it('accepts the finalize permission independently of manage permission', async () => {
    const { fixture, page } = await setup();
    user.set({ id: 1, roles: ['employee'], permissions: ['flocks.finalize'] }); fixture.detectChanges();
    page.openStatusEditor(); fixture.detectChanges();
    expect(page.statusForm.controls.status.value).toBe('active');
    expect(fixture.nativeElement.querySelector('.status-edit')).not.toBeNull();
    (fixture.nativeElement.querySelector('.start-finalization') as HTMLButtonElement).click();
    expect(page.statusForm.controls.status.value).toBe('finished');
    finalize.mockReturnValue(of(finalizationResult()));
    page.statusForm.controls.reason.setValue('Fin del ciclo'); page.statusForm.controls.confirmFinalization.setValue(true); page.saveStatus();
    expect(finalize).toHaveBeenCalledOnce(); expect(changeStatus).not.toHaveBeenCalled();
  });

  it('does not allow manage permission to authorize finalization', async () => {
    const { fixture, page } = await setup();
    user.set({ id: 1, roles: ['employee'], permissions: ['flocks.manage'] }); fixture.detectChanges();
    page.openStatusEditor(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.start-finalization')).toBeNull();
    page.openFinalization(); expect(page.statusForm.controls.status.value).toBe('active');
    page.statusForm.setValue({ status: 'finished', reason: 'Fin del ciclo', confirmFinalization: true }); page.saveStatus();
    expect(finalize).not.toHaveBeenCalled(); expect(changeStatus).not.toHaveBeenCalled();
  });

  it.each([0, -3])('shows zero outgoing birds for a non-positive balance (%s)', async (current_quantity) => {
    const { fixture, page } = await setup();
    page.flock.set({ ...flock, current_quantity }); page.openStatusEditor();
    page.statusForm.controls.status.setValue('finished'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#finalization-impact').textContent).toContain('egreso de 0 aves');
  });

  it('returns to the state selector with the reason preserved and finalization consent reset', async () => {
    const { fixture, page } = await setup();
    page.openStatusEditor();
    page.statusForm.setValue({ status: 'finished', reason: 'Fin del ciclo', confirmFinalization: true }); fixture.detectChanges();
    (fixture.nativeElement.querySelector('.status-secondary') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(page.statusForm.controls.status.value).toBe('active');
    expect(page.statusForm.controls.reason.value).toBe('Fin del ciclo');
    expect(page.statusForm.controls.confirmFinalization.value).toBe(false);
    expect(fixture.nativeElement.querySelector('#status-title').textContent).toBe('Cambiar estado del lote');
    expect(fixture.nativeElement.querySelector('input[value="finished"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.start-finalization').textContent).toContain('Finalizar');
    expect(finalize).not.toHaveBeenCalled();
  });

  it('preserves the finalization draft on a conflict and requires a fresh version', async () => {
    const { page } = await setup();
    finalize.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    page.openStatusEditor(); page.statusForm.setValue({ status: 'finished', reason: 'Fin del ciclo', confirmFinalization: true });
    page.saveStatus(); page.saveStatus();
    expect(finalize).toHaveBeenCalledOnce(); expect(page.statusConflict()).toBe(true);
    expect(page.statusForm.controls.reason.value).toBe('Fin del ciclo'); expect(page.flock()?.status).toBe('active');
  });

  it.each([403, 422])('keeps the draft and the current state after rejection (%s)', async (status) => {
    const { page } = await setup();
    changeStatus.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    page.openStatusEditor(); page.statusForm.controls.status.setValue('quarantined'); page.statusForm.controls.reason.setValue('Control'); page.saveStatus();
    expect(page.statusError()).toBeTruthy();
    expect(page.statusUncertain()).toBe(false);
    expect(page.statusForm.controls.reason.value).toBe('Control');
    expect(page.flock()?.status).toBe('active');
  });

  it('sends active for an existing quarantined lot', async () => {
    const { page } = await setup();
    page.flock.set({ ...flock, status: 'quarantined' });
    changeStatus.mockReturnValue(of({ operation_id: 'op', flock: { ...flock, version: 3 } }));
    page.openStatusEditor(); page.statusForm.controls.status.setValue('active'); page.statusForm.controls.reason.setValue('Alta sanitaria'); page.saveStatus();
    expect(changeStatus.mock.calls[0][1]).toMatchObject({ status: 'active', reason: 'Alta sanitaria' });
    expect(page.statusText()).toBe('Activo');
  });

  it('retries a lost response with the same body and key and locks dismissal and editing', async () => {
    const { page } = await setup();
    changeStatus.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 }))).mockReturnValueOnce(of(statusResult()));
    page.openStatusEditor(); page.statusForm.controls.status.setValue('quarantined'); page.statusForm.controls.reason.setValue('Control sanitario'); page.saveStatus();
    expect(page.statusUncertain()).toBe(true);
    const cancel = new Event('cancel', { cancelable: true }); page.closeStatusEditor(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    page.statusForm.controls.reason.setValue('No reemplazar el intento'); page.saveStatus();
    expect(changeStatus.mock.calls[1]).toEqual(changeStatus.mock.calls[0]);
    expect(page.statusUncertain()).toBe(false);
  });

  it('requires a fresh detail after a version conflict', async () => {
    const { page } = await setup();
    changeStatus.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    page.openStatusEditor(); page.statusForm.controls.status.setValue('quarantined'); page.statusForm.controls.reason.setValue('Control'); page.saveStatus(); page.saveStatus();
    expect(changeStatus).toHaveBeenCalledTimes(1);
    expect(page.statusConflict()).toBe(true);
    expect(page.flock()?.status).toBe('active');
    page.load(); expect(page.statusConflict()).toBe(false);
  });

  it('starts with quarantine selected and explains the backend restriction for finished lots', async () => {
    const { fixture, page } = await setup();
    page.flock.set({ ...flock, status: 'quarantined' }); page.openStatusEditor();
    expect(page.statusForm.controls.status.value).toBe('quarantined');
    page.flock.set({ ...flock, status: 'finished' }); fixture.detectChanges(); page.openStatusEditor();
    page.statusForm.controls.reason.setValue('Reabrir'); page.saveStatus();
    expect(changeStatus).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.status-notice').textContent).toContain('no es posible reabrirlo');
    expect(fixture.nativeElement.querySelector('.status-primary')).toBeNull();
  });

  it('hides editing without manage permission and accepts an explicit grant', async () => {
    const { fixture, page } = await setup();
    user.set({ id: 1, roles: ['employee'], permissions: ['flocks.view'] }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-edit')).toBeNull();
    page.openStatusEditor(); page.saveStatus(); expect(changeStatus).not.toHaveBeenCalled();
    user.set({ id: 1, roles: ['employee'], permissions: ['flocks.manage'] }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-edit')).not.toBeNull();
  });

  it('discards pending replies and the reason when identity changes', async () => {
    const { fixture, page } = await setup();
    const pending = new Subject<ReturnType<typeof statusResult>>(); changeStatus.mockReturnValue(pending);
    page.openStatusEditor(); page.statusForm.controls.status.setValue('quarantined'); page.statusForm.controls.reason.setValue('Privado'); page.saveStatus();
    user.set({ id: 2, roles: ['admin'], permissions: [] }); fixture.detectChanges();
    pending.next(statusResult());
    expect(page.statusForm.controls.reason.value).toBe('');
    expect(page.flock()?.status).toBe('active');
    expect(page.statusSuccess()).toBeNull();
  });

  it('shows the configured ration, manual mode and forecast without promising an automatic change', async () => {
    const { card } = await setup();
    expect(loadOverview).toHaveBeenCalledWith(flock.id, 7);
    expect(card.textContent).toContain('Pollitos bb 1');
    expect(card.textContent).toContain('Manual');
    expect(card.textContent).toContain('20 oct. 2026 · Día 20');
    expect(card.textContent).toContain('requieren volver a automático');
    expect(card.querySelector('a')?.getAttribute('href')).toContain('/lot-1/alimentacion');
  });

  it('preserves the flock origin when opening its management plan', async () => {
    const { fixture } = await setup();
    expect(fixture.nativeElement.querySelector('.plan-card')?.getAttribute('href'))
      .toBe('/administracion/manejo-lotes/planes/lotes/lot-1?from=flock');
  });

  it('returns to the source house and keeps that origin when opening the plan', async () => {
    queryParamMap.next(convertToParamMap({ lotFrom: 'house', unitId: '7', houseId: '22' }));
    const { fixture } = await setup();
    const back = fixture.nativeElement.querySelector('.back-link') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/administracion/unidades-productivas/7/galpon/22');
    expect(back.textContent).toContain('Volver al galpón');
    expect(fixture.nativeElement.querySelector('.plan-card')?.getAttribute('href'))
      .toBe('/administracion/manejo-lotes/planes/lotes/lot-1?from=flock&lotFrom=house&unitId=7&houseId=22');
    queryParamMap.next(convertToParamMap({})); fixture.detectChanges();
    expect(back.getAttribute('href')).toBe('/administracion/lotes/lotes');
    expect(back.textContent).toContain('Volver a lotes');
  });

  it.each([
    {}, { lotFrom: 'unknown', unitId: '7', houseId: '22' },
    { lotFrom: 'house', unitId: '7' }, { lotFrom: 'house', unitId: '-1', houseId: '22' },
    { lotFrom: 'house', unitId: '7', houseId: '0' }, { lotFrom: 'house', unitId: '7', houseId: '22/editar' },
  ])('returns to the lot list for an absent or invalid source (%j)', async (params) => {
    queryParamMap.next(convertToParamMap(params));
    const { fixture } = await setup();
    expect(fixture.nativeElement.querySelector('.back-link')?.getAttribute('href')).toBe('/administracion/lotes/lotes');
  });

  it('shows automatic mode and treats the future recipe availability as a forecast', async () => {
    loadOverview.mockReturnValue(of({ ...overview, current: { ...overview.current, modo: 'automatico' } }));
    const { card } = await setup();
    expect(card.textContent).toContain('Automático');
    expect(card.textContent).toContain('sujeto a disponibilidad');
    expect(card.textContent).not.toContain('requieren volver');
  });

  it.each([
    { value: { ...overview, nextChange: null }, expected: 'Sin próximos cambios previstos en el plan' },
    { value: { ...overview, scheduleAvailable: false, nextChange: null }, expected: 'Próximo cambio previsto: dato no disponible' },
    { value: { ...overview, current: { ...overview.current, finalizado: true } }, expected: 'Lote finalizado · sin próximos cambios' },
  ])('distinguishes missing schedules, exhausted plans and finalized flocks: $expected', async ({ value, expected }) => {
    loadOverview.mockReturnValue(of(value));
    const { card } = await setup();
    expect(card.textContent).toContain(expected);
  });

  it('keeps the rest of the detail usable when feeding cannot be loaded', async () => {
    loadOverview.mockReturnValue(throwError(() => new Error('Unavailable')));
    const { fixture, card } = await setup();
    expect(card.textContent).toContain('Alimentación no disponible');
    expect(fixture.nativeElement.textContent).toContain('LOT-FEED-TEST');
    expect(card.querySelector('a')).not.toBeNull();
  });

  it('clears the previous overview while reloading instead of retaining stale feeding details', async () => {
    const { fixture, page, card } = await setup();
    loadOverview.mockReturnValue(new Subject<FlockFeedingOverview>());
    page.load(); fixture.detectChanges();
    expect(page.feeding().state).toBe('loading');
    expect(card.textContent).not.toContain('Pollitos bb 1');
  });
});
