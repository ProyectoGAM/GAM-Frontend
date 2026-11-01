import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { FlockFeedingService } from '../../../flocks/services/flock-feeding.service';
import { FlockDetailService } from '../../../flocks/services/flock-detail.service';
import { FlockMortalitiesService } from '../../../flocks/services/flock-mortalities.service';
import { MortalityUndoComponent } from '../../../flocks/components/mortality-undo/mortality-undo.component';
import { InventoryApi } from '../../../inventory/services/inventory.api';
import { AuditAction, AuditActorOption, AuditDetail, AuditEntry, AuditPage } from '../../interfaces/audit';
import { actorKey } from '../../services/audit-presentation';
import { AuditService } from '../../services/audit.service';
import { AuditHistoryPage } from './audit-history.page';

const actor = { id: 12, type: 'User', kind: 'person', name: 'Ana histórica', current_name: 'Ana actual', exists: true, status: 'active', can_manage: true } as const;
const option: AuditActorOption = { ...actor, value: 12, label: 'Ana histórica' };
const entry: AuditEntry = {
  id: 5, log_name: 'inventory', event: 'new_backend_event', source: 'api',
  actor, created_at: '2026-10-30T14:00:00Z',
  presentation: { title: 'Evento nuevo explicado por API', summary: 'Se registraron 36,001 kg.', subject: { label: 'Lote Inicial', resource: 'flock', id: 'public-id' }, production_unit: { id: 3, name: 'Granja histórica' } },
};
const detail = (actions: AuditAction[] = []): AuditDetail => ({
  id: entry.id, event: entry.event, created_at: entry.created_at, actor,
  presentation: { ...entry.presentation, facts: [{ label: 'Fecha de consumo', value: '30/10/2026' }],
    changes: [{ label: 'Ración', before: null, after: '36,001 kg' }], changes_state: 'partial',
    history: { state: 'partial', missing: ['No se conservó el nombre de la receta.'] },
    reversibility: { state: 'unknown', reason: 'Este caso todavía no tiene una corrección integrada.' }, actions },
});
const meta = { current_page: 1, last_page: 3, total: 60, per_page: 25, from: 1, to: 25 };
const response = (data = [entry]): AuditPage => ({ data, meta });
const action: AuditAction = { kind: 'reverse_inventory_movement', label: 'Revertir movimiento', available: true, reason: null, target: { resource: 'inventory_movement', id: 45 } };

describe('Audit history API presentation', () => {
  let fixture: ComponentFixture<AuditHistoryPage>;
  let restore: () => void;
  const params = new BehaviorSubject(convertToParamMap({}));
  const user = signal({ id: 1, name: 'Auditor', permissions: ['audit.view'], roles: [] });
  const session = signal({ id: 'session-1' });
  const auth = { user, session, status: () => 'personal_authenticated', isAdmin: () => false, refreshIdentity: vi.fn() };
  const api = { entries: vi.fn(), detail: vi.fn(), options: vi.fn(), responsibles: vi.fn() };
  const inventory = { movement: vi.fn(), reverse: vi.fn() };
  beforeEach(() => {
    restore = stubNativeDialog(); vi.resetAllMocks(); params.next(convertToParamMap({}));
    user.set({ id: 1, name: 'Auditor', permissions: ['audit.view', 'inventory.adjust'], roles: [] }); session.set({ id: 'session-1' });
    api.entries.mockReturnValue(of(response())); api.detail.mockReturnValue(of({ data: detail() }));
    api.responsibles.mockReturnValue(of({ data: [option], meta }));
    api.options.mockReturnValue(of({ data: { audit: { events: [{ value: 'new_backend_event', label: 'Evento del servidor' }], sources: [] }, production_units: [] } }));
    inventory.movement.mockReturnValue(of({ data: { id: 45, type: 'receipt', occurred_at: '2026-10-30T14:00:00Z', lines: [] } }));
    TestBed.configureTestingModule({ imports: [AuditHistoryPage], providers: [
      provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
      { provide: AuditService, useValue: api }, { provide: AuthStore, useValue: auth }, { provide: InventoryApi, useValue: inventory },
      { provide: FlockFeedingService, useValue: { consumptions: vi.fn(), balances: vi.fn(), correct: vi.fn() } },
      { provide: FlockDetailService, useValue: { flock: vi.fn() } },
      { provide: FlockMortalitiesService, useValue: { list: vi.fn(), cancel: vi.fn() } },
    ] });
    fixture = TestBed.createComponent(AuditHistoryPage);
  });
  afterEach(() => { fixture.destroy(); restore(); });
  async function settle() { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const button = (label: string) => [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!;
  async function openDetail() { (fixture.nativeElement.querySelector('.detail-button') as HTMLButtonElement).click(); await settle(); }

  it('uses list summaries without fetching per-row details and keeps server totals', async () => {
    await settle();
    expect(api.entries).toHaveBeenLastCalledWith({ log_name: undefined, page: 1, per_page: 25 });
    expect(api.detail).not.toHaveBeenCalled(); expect(inventory.movement).not.toHaveBeenCalled();
    expect(text()).toContain('Evento nuevo explicado por API'); expect(text()).toContain('36,001 kg');
    expect(text()).toContain('Ana histórica'); expect(text()).toContain('Granja histórica'); expect(text()).toContain('60');
    expect(fixture.nativeElement.querySelectorAll('.module-tabs a')).toHaveLength(9);
    expect(text()).not.toContain('Geografía'); expect(text()).not.toContain('new_backend_event');
  });
  it('searches actors for audit-only readers and sends exact composite identity filters', async () => {
    await settle(); expect(api.responsibles).toHaveBeenCalledWith('', 1);
    button('Filtros').click(); await settle();
    fixture.componentInstance.filters.patchValue({ actor: actorKey(option), from: '2026-10-01', to: '2026-10-30', up_id: '3' });
    button('Ver resultados').click(); await settle();
    expect(api.entries).toHaveBeenLastCalledWith(expect.objectContaining({ actor_kind: 'person', actor_type: 'User', actor_id: 12, up_id: 3, page: 1 }));
    button('Siguiente').click(); await settle();
    expect(api.entries).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    params.next(convertToParamMap({ modulo: 'lots' })); await settle();
    expect(api.entries).toHaveBeenLastCalledWith(expect.objectContaining({ actor_id: 12, log_name: 'lots', page: 1 }));
    expect(fixture.componentInstance.filterCount()).toBe(4);
  });
  it.each(['system', 'unavailable'] as const)('sends the special %s actor without a null id', async (kind) => {
    const special = { ...option, kind, value: null, type: null, name: null, current_name: null };
    api.responsibles.mockReturnValue(of({ data: [special], meta }));
    await settle(); button('Filtros').click(); await settle();
    fixture.componentInstance.filters.controls.actor.setValue(actorKey(special));
    button('Ver resultados').click(); await settle();
    const filters = api.entries.mock.calls.at(-1)![0];
    expect(filters.actor_kind).toBe(kind); expect(filters).not.toHaveProperty('actor_id');
    expect(filters).not.toHaveProperty('actor_type');
  });
  it('keeps selected actors across paginated searches and ignores stale search responses', async () => {
    await settle();
    const pending = new Subject<unknown>(); api.responsibles.mockReturnValueOnce(pending);
    const first = fixture.componentInstance.loadResponsibles('Ana');
    api.responsibles.mockReturnValueOnce(of({ data: [{ ...option, value: 19, name: 'Beatriz' }], meta }));
    await fixture.componentInstance.loadResponsibles('Beatriz');
    pending.next({ data: [option], meta }); pending.complete(); await first; await settle();
    expect(fixture.componentInstance.responsibles()[0].label).toBe('Beatriz');
    expect(api.responsibles).toHaveBeenLastCalledWith('Beatriz', 1);
    await fixture.componentInstance.loadResponsibles('Beatriz', 2);
    expect(api.responsibles).toHaveBeenLastCalledWith('Beatriz', 2);
  });
  it('rejects invalid date ranges and nonselected actors', async () => {
    await settle(); button('Filtros').click(); await settle();
    fixture.componentInstance.filters.patchValue({ from: '2026-10-30', to: '2026-10-01', actor: 'invalid' });
    button('Ver resultados').click(); await settle();
    expect(api.entries).toHaveBeenCalledOnce(); expect(text()).toContain('La fecha final');
    expect(text()).toContain('Elige un responsable de la lista');
  });
  it('fetches detail on demand, preserves exact text and distinguishes missing historical values', async () => {
    await settle(); await openDetail();
    expect(api.detail).toHaveBeenCalledWith(5);
    expect(text()).toContain('Valor histórico no disponible'); expect(text()).not.toContain('Sin registrar');
    expect(text()).toContain('30/10/2026'); expect(text()).toContain('No se conservó el nombre de la receta.');
    expect(text()).toContain('Otros datos del registro se omiten');
    expect(text()).toContain('Este caso todavía no tiene una corrección integrada.');
    expect(text()).not.toContain('irreversible'); expect(inventory.reverse).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('audit-detail-title');
    fixture.nativeElement.querySelector('.detail-dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle(); expect(fixture.componentInstance.detail()).toBeNull();
    expect(document.activeElement?.classList.contains('detail-button')).toBe(true);
  });
  it.each([
    ['daily_weighing_entry_added', null, 'pesajes', 'Ir a pesajes'],
    ['eggs_collected', 'Postura Norte', 'recoleccion', 'Ir a postura'],
    ['egg_collection_cancelled', 'Postura Norte', 'recoleccion', 'Ir a postura'],
    ['flock_updated', 'Lote Norte', '', 'Ir al lote'],
  ])('links the historical flock and owning section for %s without running a command', async (event, label, segment, actionLabel) => {
    const value = detail(); value.event = event;
    const id = '01K8Y2N7AA2XQY0YQEBMWVFJ9F';
    value.presentation.subject = { resource: 'flock', id, label };
    api.detail.mockReturnValue(of({ data: value })); await settle(); await openDetail();
    const root = fixture.nativeElement as HTMLElement;
    const link = root.querySelector<HTMLAnchorElement>('.flock-link')!;
    expect(link.textContent?.trim()).toBe(label ?? 'Ver lote');
    expect(link.getAttribute('href')).toBe(`/administracion/lotes/lotes/${id}`);
    const section = root.querySelector<HTMLAnchorElement>('.action-tools .section-link')!;
    expect(section.textContent).toContain(actionLabel);
    expect(section.getAttribute('href')).toBe(`/administracion/lotes/lotes/${id}${segment ? '/' + segment : ''}`);
    expect(inventory.reverse).not.toHaveBeenCalled(); expect(inventory.movement).not.toHaveBeenCalled();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    section.click(); await settle();
    expect(navigate).toHaveBeenCalledOnce();
    expect(root.querySelector<HTMLDialogElement>('.detail-dialog')!.open).toBe(false);
  });
  it('clears previous flock destinations while reloading detail and never uses list-only references', async () => {
    const value = detail(); value.presentation.subject = { resource: 'flock', id: '01K8Y2N7AA2XQY0YQEBMWVFJ9F', label: null };
    api.detail.mockReturnValueOnce(of({ data: value })); await settle(); await openDetail();
    expect(fixture.nativeElement.querySelector('.flock-link')).not.toBeNull();
    const pending = new Subject<{ data: AuditDetail }>(); api.detail.mockReturnValueOnce(pending);
    const loading = fixture.componentInstance.loadDetail(); await settle();
    expect(fixture.nativeElement.querySelector('.flock-link')).toBeNull();
    pending.next({ data: detail() }); pending.complete(); await loading; await settle();
    expect(fixture.nativeElement.querySelector('.section-link')).toBeNull();
    expect(fixture.nativeElement.querySelector('.flock-link')).toBeNull();
  });
  it.each(['unavailable', 'not_recorded'] as const)('does not claim that no changes occurred for %s', async (state) => {
    const value = detail(); value.presentation.changes = []; value.presentation.changes_state = state;
    api.detail.mockReturnValue(of({ data: value })); await settle(); await openDetail();
    expect(text()).not.toContain('No hubo cambios');
    expect(text()).toContain(state === 'unavailable' ? 'formato explicable' : 'No se conservó una comparación');
  });
  it('does not infer management links from actor ids or current session roles', async () => {
    api.entries.mockReturnValue(of(response([{ ...entry, actor: { ...actor, can_manage: false } }])));
    await settle(); expect(fixture.nativeElement.querySelector('.person-link')).toBeNull();
    api.entries.mockReturnValue(of(response([{ ...entry, actor: { ...actor, exists: false } }])));
    await fixture.componentInstance.load(); await settle(); expect(fixture.nativeElement.querySelector('.person-link')).toBeNull();
  });
  it('recovers a failed detail and ignores replies after closing or changing sessions', async () => {
    api.detail.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    await settle(); await openDetail(); expect(text()).toContain('No se pudo consultar el detalle');
    button('Reintentar detalle').click(); await settle(); expect(fixture.componentInstance.detail()).not.toBeNull();
    const pending = new Subject<{ data: AuditDetail }>(); api.detail.mockReturnValueOnce(pending);
    const loading = fixture.componentInstance.loadDetail();
    session.set({ id: 'session-2' }); await settle();
    pending.next({ data: detail([action]) }); pending.complete(); await loading; await settle();
    expect(fixture.componentInstance.detail()).toBeNull();
    expect(fixture.nativeElement.querySelector('.detail-dialog').open).toBe(false);
  });
  it('revalidates availability before opening the module confirmation without mutating', async () => {
    api.detail.mockReturnValue(of({ data: detail([action]) }));
    await settle(); await openDetail();
    await fixture.componentInstance.runAction(action, button('Revertir movimiento')); await settle();
    expect(api.detail).toHaveBeenCalledTimes(2); expect(inventory.movement).toHaveBeenCalledWith(45);
    expect(fixture.nativeElement.querySelector('.reversal-dialog').open).toBe(true);
    expect(inventory.reverse).not.toHaveBeenCalled();
  });
  it('revalidates mortality undo and opens its modal over the audit detail without navigation', async () => {
    const undo: AuditAction = { kind: 'undo_mortality', label: 'Deshacer', available: true, reason: null,
      target: { resource: 'mortality_record', id: '01K8Y2N7AA2XQY0YQEBMWVFJ9G', flock_id: '01K8Y2N7AA2XQY0YQEBMWVFJ9F' } };
    api.detail.mockReturnValue(of({ data: detail([undo]) }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const open = vi.spyOn(MortalityUndoComponent.prototype, 'open').mockResolvedValue();
    await settle(); await openDetail();
    await fixture.componentInstance.runAction(undo, button('Deshacer')); await settle();
    expect(api.detail).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith(undo.target.flock_id, undo.target.id, expect.any(HTMLElement));
    expect(navigate).not.toHaveBeenCalled();
    expect(inventory.reverse).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.detail-dialog').open).toBe(true);
  });
  it('does not navigate when mortality was undone while reviewing the audit entry', async () => {
    const undo: AuditAction = { kind: 'undo_mortality', label: 'Deshacer', available: true, reason: null,
      target: { resource: 'mortality_record', id: '01K8Y2N7AA2XQY0YQEBMWVFJ9G', flock_id: '01K8Y2N7AA2XQY0YQEBMWVFJ9F' } };
    api.detail.mockReturnValueOnce(of({ data: detail([undo]) })).mockReturnValue(of({ data: detail([{ ...undo, available: false, reason: 'Este registro ya fue deshecho.' }]) }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await settle(); await openDetail(); await fixture.componentInstance.runAction(undo, button('Deshacer')); await settle();
    expect(navigate).not.toHaveBeenCalled(); expect(text()).toContain('ya fue deshecho');
  });
  it('blocks stale or unknown actions without constructing destinations from subject identifiers', async () => {
    api.detail.mockReturnValueOnce(of({ data: detail([action]) })).mockReturnValue(of({ data: detail([{ ...action, available: false, reason: 'Ya fue revertido.' }]) }));
    await settle(); await openDetail(); button('Revertir movimiento').click(); await settle();
    expect(text()).toContain('Ya fue revertido'); expect(inventory.movement).not.toHaveBeenCalled();
    api.detail.mockReturnValue(of({ data: detail([{ ...action, kind: 'unknown_command', label: 'Operación futura' }]) }));
    await fixture.componentInstance.loadDetail(); await settle(); expect(button('Operación futura').disabled).toBe(true);
  });
  it('refreshes both queries after success and conflicts and refreshes permissions after a forbidden command', async () => {
    await settle(); await openDetail(); api.detail.mockClear(); api.entries.mockClear();
    fixture.componentInstance.onCorrected(); await settle();
    expect(api.detail).toHaveBeenCalledOnce(); expect(api.entries).toHaveBeenCalledOnce();
    fixture.componentInstance.onCommandFailed(409); await settle();
    expect(api.detail).toHaveBeenCalledTimes(2); expect(api.entries).toHaveBeenCalledTimes(2);
    fixture.componentInstance.onCommandFailed(403); await settle(); expect(auth.refreshIdentity).toHaveBeenCalledOnce();
  });
  it('renders all backend text as plain text', async () => {
    const value = detail(); value.presentation.facts = [{ label: '<b>Dato</b>', value: '<img src=x onerror=alert(1)>' }];
    api.detail.mockReturnValue(of({ data: value })); await settle(); await openDetail();
    expect(text()).toContain('<img'); expect(fixture.nativeElement.querySelector('.detail-body img')).toBeNull();
  });
  it.each([0, 403, 500])('shows the appropriate list error for HTTP %s', async (status) => {
    api.entries.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    await settle(); expect(fixture.componentInstance.state()).toBe(status === 403 ? 'forbidden' : 'error');
    expect(text()).not.toContain('No hay acciones para mostrar');
  });
});
