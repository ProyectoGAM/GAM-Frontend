import { AuditAction, AuditActor, AuditRecord } from '../interfaces/audit';
import { auditFlockNavigation, auditUserLink, supportedAction } from './audit-actions';

const actor: AuditActor = { id: 5, type: 'User', kind: 'person', name: 'Ana', current_name: 'Ana', exists: true, status: 'disabled', can_manage: true };
const flockId = '01K8Y2N7AA2XQY0YQEBMWVFJ9F';
const record: AuditRecord = { id: 1, event: 'daily_weighing_entry_added', actor, created_at: null,
  presentation: { title: 'Pesaje', summary: 'Ingreso registrado', subject: { resource: 'flock', id: flockId, label: null }, production_unit: null } };
describe('Audit destinations', () => {
  it('links public flock references even without a historical label', () => {
    expect(auditFlockNavigation(record)).toEqual({ path: `/administracion/lotes/lotes/${flockId}`, label: 'Ver lote', section: {
      path: `/administracion/lotes/lotes/${flockId}/pesajes`, label: 'Ir a pesajes', description: expect.stringContaining('individual o grupal'),
    } });
    expect(auditFlockNavigation({ ...record, presentation: { ...record.presentation, subject: { ...record.presentation.subject, label: '  Lote histórico  ' } } })?.label).toBe('Lote histórico');
  });
  it.each([null, 12, '12', '', '../usuarios', 'https://example.com', '01K8Y2N7AA2XQY0YQEBMWVFJ9F/otro', '81K8Y2N7AA2XQY0YQEBMWVFJ9F'])('rejects invalid or internal flock identifiers: %s', (id) => {
    expect(auditFlockNavigation({ ...record, presentation: { ...record.presentation, subject: { resource: 'flock', id, label: 'Lote' } } })).toBeNull();
  });
  it('never infers a flock from a different resource, label or event', () => {
    expect(auditFlockNavigation({ ...record, presentation: { ...record.presentation, subject: { resource: 'weighing', id: flockId, label: 'Lote' } } })).toBeNull();
  });
  it.each([
    ['eggs_collected', 'recoleccion'], ['egg_collection_corrected', 'recoleccion'], ['egg_collection_cancelled', 'recoleccion'],
    ['weighing_recorded', 'pesajes'], ['weighing_corrected', 'pesajes'], ['daily_weighing_entry_deleted', 'pesajes'], ['daily_weighing_reference_updated', 'pesajes'],
    ['mortality_recorded', 'mortalidad'], ['mortality_corrected', 'mortalidad'], ['mortality_cancelled', 'mortalidad'], ['flock_mortality_corrected', 'mortalidad'], ['flock_mortality_applied', 'mortalidad'],
    ['feed_consumption_recorded', 'alimentacion'], ['feed_consumption_corrected', 'alimentacion'], ['flock_feeding_manual_changed', 'alimentacion'],
    ['vaccination_application_recorded', 'sanidad'], ['medicine_application_recorded', 'sanidad'],
  ])('offers the owning section for %s without inventing a record identifier', (event, section) => {
    expect(auditFlockNavigation({ ...record, event })?.section?.path).toBe(`/administracion/lotes/lotes/${flockId}/${section}`);
  });
  it.each(['flock_updated', 'flock_finalized', 'unknown_event', 'constructor', 'toString', '__proto__', null])('keeps general flock navigation without inventing a correction for %s', (event) => {
    expect(auditFlockNavigation({ ...record, event })).toMatchObject({ path: `/administracion/lotes/lotes/${flockId}`, section: null });
  });
  it('only links accounts that exist and can be managed, including disabled accounts', () => {
    expect(auditUserLink(actor)).toBe('/administracion/usuarios/5');
    expect(auditUserLink({ ...actor, can_manage: false })).toBeNull();
    expect(auditUserLink({ ...actor, exists: false })).toBeNull();
    expect(auditUserLink({ ...actor, kind: 'unavailable' })).toBeNull();
  });
  it('only dispatches known action/resource pairs with valid targets', () => {
    const action: AuditAction = { kind: 'reverse_inventory_movement', label: 'Revertir', available: true, reason: null, target: { resource: 'inventory_movement', id: 2 } };
    expect(supportedAction(action)).toBe(true);
    expect(supportedAction({ ...action, kind: 'execute_url' })).toBe(false);
    expect(supportedAction({ ...action, target: { resource: 'feed_consumption', id: 2 } })).toBe(false);
    expect(supportedAction({ ...action, kind: 'correct_feed_consumption', target: { resource: 'feed_consumption', id: 2, flock_id: 'public-lot' } })).toBe(true);
    expect(supportedAction({ ...action, target: { ...action.target, id: -2 } })).toBe(false);
  });
  it('only offers mortality undo with both public identifiers and the matching resource', () => {
    const undo: AuditAction = { kind: 'undo_mortality', label: 'Deshacer', available: true, reason: null,
      target: { resource: 'mortality_record', id: '01K8Y2N7AA2XQY0YQEBMWVFJ9G', flock_id: flockId } };
    expect(supportedAction(undo)).toBe(true);
    expect(supportedAction({ ...undo, target: { ...undo.target, id: 12 } })).toBe(false);
    expect(supportedAction({ ...undo, target: { ...undo.target, flock_id: '../otro' } })).toBe(false);
    expect(supportedAction({ ...undo, target: { ...undo.target, resource: 'inventory_movement' } })).toBe(false);
    expect(supportedAction({ ...undo, kind: 'reverse_inventory_movement' })).toBe(false);
  });
});
