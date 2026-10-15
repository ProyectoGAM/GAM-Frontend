import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { IonModal } from '@ionic/angular';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FeedingEditorComponent } from '../../components/feeding-editor/feeding-editor.component';
import { FeedBalance, FeedConsumption, FlockFeeding } from '../../interfaces/flock-feeding.interface';
import { Flock } from '../../interfaces/flock.interface';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockFeedingService } from '../../services/flock-feeding.service';
import { FlockFeedingPage } from './flock-feeding.page';

const flock = { id: 'lot-1', code: 'PONEDORAS-89', poultry_house_id: 3, production_unit_id: 7, status: 'active' } as Flock;
const stage = { recipe_id: 1, recipe_snapshot: { name: 'Ponedoras' } };
const feeding: FlockFeeding = { id: 10, lote_id: 'lot-1', modo: 'automatico', receta_id: 1,
  cantidad_diaria_g: '128000', cantidad_manual_g: null, edad_dias: 10, fecha_vigencia: '2026-10-10', etapa: stage, finalizado: false };
const records: FeedConsumption[] = [
  { id: 3, fecha: '2026-10-13', up_id: 7, modo: 'automatico', receta_id: 1, cantidad_g: '127000', original: { receta_id: 1, cantidad_g: '127000' }, etapa: stage },
  { id: 2, fecha: '2026-10-12', up_id: 7, modo: 'manual', receta_id: 2, cantidad_g: '1000', original: { receta_id: 1, cantidad_g: '125000' }, etapa: stage },
];
const balance = (id: number, stock: string, status: 'active' | 'inactive' = 'active', up = 7): FeedBalance => ({
  receta_id: id, nombre_receta: id === 1 ? 'Ponedoras' : `Receta ${id}`, estado_receta: status,
  up_id: up, nombre_up: 'UP San José', saldo_g: stock,
});

describe('FlockFeedingPage', () => {
  const params = new BehaviorSubject(convertToParamMap({ id: 'lot-1' }));
  const user = signal<{ id: number; name: string } | null>({ id: 4, name: 'Ana Pérez' });
  const current = vi.fn<FlockFeedingService['current']>();
  const consumptions = vi.fn<FlockFeedingService['consumptions']>();
  const balances = vi.fn<FlockFeedingService['balances']>();
  const change = vi.fn<FlockFeedingService['change']>();
  const correct = vi.fn<FlockFeedingService['correct']>();
  const automatic = vi.fn<FlockFeedingService['automatic']>();
  const latestChanges = vi.fn<FlockFeedingService['latestChanges']>();

  beforeEach(() => {
    current.mockReset().mockReturnValue(of(feeding));
    consumptions.mockReset().mockReturnValue(of(records));
    balances.mockReset().mockReturnValue(of([balance(1, '1000'), balance(2, '0'), balance(3, '-1'), balance(4, '100', 'inactive'), balance(5, '100', 'active', 8)]));
    change.mockReset().mockReturnValue(of({})); correct.mockReset().mockReturnValue(of({}));
    automatic.mockReset().mockReturnValue(of({}));
    latestChanges.mockReset().mockReturnValue(of([{ id: 10, modo: 'manual', created_by: 4, etapas_copiadas: [] }]));
    params.next(convertToParamMap({ id: 'lot-1' })); user.set({ id: 4, name: 'Ana Pérez' });
    TestBed.configureTestingModule({ imports: [FlockFeedingPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: AuthStore, useValue: { user } },
      { provide: FlockFeedingService, useValue: { current, consumptions, balances, change, correct, automatic, latestChanges } },
      { provide: FlockDetailService, useValue: { flock: () => of(flock) } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: () => of({ data: { name: 'Galpón 3' } }) } },
      { provide: AdminUnitContextService, useValue: { units: signal([{ id: 7, name: 'UP San José' }]) } },
    ] });
  });

  const setup = async () => {
    const fixture = TestBed.createComponent(FlockFeedingPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance };
  };

  it('renders the lot, all recipe totals, and edit actions without removing consumption', async () => {
    const { fixture, page } = await setup();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('PONEDORAS-89'); expect(text).toContain('128');
    expect(page.summary().map((item) => item.grams).sort()).toEqual(['1000', '127000']);
    expect(page.total()).toBe('128');
    expect(fixture.nativeElement.querySelectorAll('.edit-button')).toHaveLength(2);
    expect(text).not.toMatch(/Eliminar|Anular suministro/);
  });

  it('filters only the graph by a single recipe and period while retaining whole-lot totals', async () => {
    const { page } = await setup();
    page.today.set('2026-10-14'); page.changeRecipe('1');
    expect(page.points().map((point) => point.grams)).toEqual(['127000']);
    page.changeRecipe('2');
    expect(page.points().map((point) => point.grams)).toEqual(['1000']);
    expect(page.periodTotal()).toBe('1'); expect(page.total()).toBe('128');
    expect(page.summary()).toHaveLength(2);
    page.period.set('all'); expect(page.fromDate()).toBeNull();
    page.changeRecipe('999'); expect(page.points()).toEqual([]);
  });

  it('offers only active positive-stock recipes from the lot UP for current changes', async () => {
    const { page } = await setup(); page.openManual();
    expect(balances).toHaveBeenCalledWith(7);
    expect(page.editorOptions().map((item) => item.id)).toEqual([1]);
  });

  it('shows the manual author only when history verifies the current configuration and identity', async () => {
    current.mockReturnValue(of({ ...feeding, modo: 'manual' }));
    const { page } = await setup();
    expect(page.modeLabel()).toBe('Manual - Ana Pérez');
    page.changes.set([{ id: 10, modo: 'manual', created_by: 99, etapas_copiadas: [] }]);
    expect(page.modeLabel()).toBe('Manual - Responsable no disponible');
    page.changes.set([{ id: 9, modo: 'manual', created_by: 4, etapas_copiadas: [] }]);
    expect(page.modeLabel()).toBe('Manual - Responsable no disponible');
  });

  it('restores the current plan through the automatic endpoint and refreshes its authoritative values', async () => {
    current.mockReturnValueOnce(of({ ...feeding, modo: 'manual', cantidad_diaria_g: '1000' }));
    const { page } = await setup(); page.openManual();
    page.save({ mode: 'automatico', recipeId: 999, grams: '999', reason: 'unused' });
    expect(automatic).toHaveBeenCalledWith('lot-1', expect.any(String));
    expect(change).not.toHaveBeenCalled(); expect(correct).not.toHaveBeenCalled();
    expect(page.feeding()).toEqual(feeding); expect(page.success()).toContain('modo automático');
    expect(page.editorOpen()).toBe(false); expect(page.total()).toBe('128');
  });

  it('keeps automatic retries idempotent and separates their key from a manual change', async () => {
    current.mockReturnValue(of({ ...feeding, modo: 'manual' }));
    automatic.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    change.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const { page } = await setup(); page.openManual();
    const submission = { mode: 'automatico' as const, recipeId: null, grams: null, reason: '' };
    page.save(submission); page.save(submission);
    expect(automatic.mock.calls[0][1]).toBe(automatic.mock.calls[1][1]);
    page.save({ mode: 'manual', recipeId: null, grams: '1000', reason: '' });
    expect(change.mock.calls[0][2]).not.toBe(automatic.mock.calls[0][1]);
  });

  it('uses the historical UP for editing, including inactive recipes and corrections to zero', async () => {
    const { page } = await setup();
    balances.mockReturnValue(of([balance(9, '0', 'inactive', 8)]));
    page.openEdit({ ...records[0], up_id: 8 });
    expect(balances).toHaveBeenLastCalledWith(8);
    expect(page.editorOptions().map((item) => item.id)).toEqual([1, 9]);
    page.save({ recipeId: 9, grams: '0', reason: 'Corrección' });
    expect(correct).toHaveBeenCalledWith('lot-1', 3, { receta_id: 9, cantidad_g: '0', motivo: 'Corrección' }, expect.any(String));
    expect(change).not.toHaveBeenCalled();
  });

  it('reuses an idempotency key on uncertain retries but creates a new key for changed data', async () => {
    const { page } = await setup(); page.openManual();
    change.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    page.save({ recipeId: null, grams: '5000', reason: '' });
    const firstKey = change.mock.calls[0][2];
    page.save({ recipeId: null, grams: '5000', reason: '' });
    expect(change.mock.calls[1][2]).toBe(firstKey);
    page.save({ recipeId: null, grams: '6000', reason: '' });
    expect(change.mock.calls[2][2]).not.toBe(firstKey);
    expect(page.saveError()).toContain('Sin conexión');
  });

  it.each(['correction', 'manual'] as const)('dismisses a saved %s before destroying its editor and allows reopening', async (mode) => {
    const response = new Subject<object>();
    (mode === 'correction' ? correct : change).mockReturnValue(response);
    const { fixture, page } = await setup();
    const open = () => mode === 'correction' ? page.openEdit(records[0]) : page.openManual();
    open(); fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(FeedingEditorComponent));
    const modal = editor.query(By.directive(IonModal));
    const overlay: IonModal = modal.componentInstance;
    const submission = { recipeId: null, grams: '1000', reason: 'Corrección de prueba' };
    editor.componentInstance.submitted.emit(submission); fixture.detectChanges();
    expect(overlay.isOpen).toBe(true); expect(overlay.canDismiss).toBe(false);
    page.closeEditor(); expect(page.editorOpen()).toBe(true);
    editor.componentInstance.submitted.emit(submission);
    expect(mode === 'correction' ? correct : change).toHaveBeenCalledTimes(1);

    response.next({}); fixture.detectChanges();
    expect(page.success()).toBeTruthy();
    expect(fixture.debugElement.query(By.directive(FeedingEditorComponent)).componentInstance).toBe(editor.componentInstance);
    expect(overlay.canDismiss).toBe(true); expect(overlay.isOpen).toBe(false);
    // Ionic reports completion only after removing its presented overlay.
    modal.triggerEventHandler('didDismiss'); fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(FeedingEditorComponent))).toBeNull();
    expect(page.editor()).toBeNull();

    open(); fixture.detectChanges();
    const reopened: FeedingEditorComponent = fixture.debugElement.query(By.directive(FeedingEditorComponent)).componentInstance;
    expect(reopened).not.toBe(editor.componentInstance);
    expect(reopened.saving()).toBe(false); expect(reopened.open()).toBe(true);
    expect(reopened.form.getRawValue()).toEqual({ recipe: '', quantity: '', reason: '' });
    reopened.closeRequested.emit(); fixture.detectChanges();
    expect(page.editorOpen()).toBe(false); expect(page.editor()).toBe(mode);
  });

  it('keeps the editor and entered data available after a failed save', async () => {
    const response = new Subject<object>(); correct.mockReturnValue(response);
    const { fixture, page } = await setup();
    page.openEdit(records[0]); fixture.detectChanges();
    const editor: FeedingEditorComponent = fixture.debugElement.query(By.directive(FeedingEditorComponent)).componentInstance;
    editor.form.patchValue({ quantity: '1', reason: 'Corrección de prueba' });
    editor.submit(); fixture.detectChanges();
    response.error(new HttpErrorResponse({ status: 422, error: { message: 'Cantidad inválida' } }));
    fixture.detectChanges();
    expect(editor.open()).toBe(true); expect(editor.saving()).toBe(false);
    expect(editor.error()).toBe('Cantidad inválida');
    expect(editor.form.getRawValue()).toEqual({ recipe: '', quantity: '1', reason: 'Corrección de prueba' });
  });

  it('ignores previous history responses after changing lot or employee', async () => {
    const old = new Subject<FeedConsumption[]>();
    consumptions.mockReturnValueOnce(old);
    const { fixture, page } = await setup();
    params.next(convertToParamMap({ id: 'lot-2' }));
    expect(page.flockId()).toBe('lot-2');
    old.next([{ ...records[0], cantidad_g: '999999' }]);
    expect(page.total()).toBe('128');
    const pending = new Subject<FeedConsumption[]>(); consumptions.mockReturnValueOnce(pending);
    page.loadHistory(); user.set(null); fixture.detectChanges(); await fixture.whenStable();
    pending.next(records);
    expect(page.records()).toEqual([]); expect(page.feeding()).toBeNull();
  });

  it('disables current changes for finalized lots but keeps historical edits available', async () => {
    current.mockReturnValue(of({ ...feeding, finalizado: true }));
    const { fixture, page } = await setup();
    expect(page.canChange()).toBe(false); page.openManual(); expect(page.editor()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.edit-button')).toHaveLength(2);
    page.openEdit(records[0]); expect(page.editor()).toBe('correction');
  });

  it('keeps failed totals unavailable and supports retry without discarding the current configuration', async () => {
    consumptions.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    const { fixture, page } = await setup();
    expect(page.historyState()).toBe('offline'); expect(page.feeding()).toEqual(feeding);
    expect(fixture.nativeElement.querySelector('.summary-total')).toBeNull();
    page.loadHistory(); fixture.detectChanges();
    expect(page.historyState()).toBe('ready'); expect(page.total()).toBe('128');
  });
});
