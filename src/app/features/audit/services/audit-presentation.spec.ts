import { AuditActor, AuditActorOption } from '../interfaces/audit';
import { actorFilters, actorKey, actorLabel, auditTitle } from './audit-presentation';

const person: AuditActor = { id: 5, type: 'User', kind: 'person', name: 'Ana histórica', current_name: 'Ana actual', exists: true, status: 'active', can_manage: true };
describe('Audit presentation from the API', () => {
  it('prefers historical names and falls back to the current name without annotations', () => {
    expect(actorLabel(person)).toBe('Ana histórica');
    expect(actorLabel({ ...person, name: null })).toBe('Ana actual');
    expect(actorLabel({ ...person, name: '   ' })).toBe('Ana actual');
    expect(actorLabel({ ...person, name: null, current_name: null })).toBe('Responsable no disponible');
    expect(actorLabel({ ...person, kind: 'system', name: null })).toBe('Sistema');
    expect(actorLabel({ ...person, id: null, name: null, current_name: null, kind: 'unavailable' })).not.toBe('Sistema');
  });
  it('keeps actor identities distinct and only sends identifiers for people', () => {
    const option = { ...person, value: 5, label: 'Ana' } satisfies AuditActorOption;
    expect(actorKey(option)).not.toBe(actorKey({ ...option, type: 'OtherUser' }));
    expect(actorKey({ ...option, kind: 'system', value: null })).not.toBe(actorKey({ ...option, kind: 'unavailable', value: null }));
    expect(actorFilters(option)).toEqual({ actor_kind: 'person', actor_type: 'User', actor_id: 5 });
    expect(actorFilters({ ...option, kind: 'system', value: null })).toEqual({ actor_kind: 'system' });
    expect(actorFilters({ ...option, kind: 'unavailable', value: null })).toEqual({ actor_kind: 'unavailable' });
  });
  it('uses backend titles for new events with a neutral fallback', () => {
    const summary = { title: 'Nuevo evento de negocio', summary: '', subject: { label: null, resource: null, id: null }, production_unit: null };
    expect(auditTitle(summary)).toBe('Nuevo evento de negocio');
    expect(auditTitle({ ...summary, title: '' })).toBe('Actividad registrada');
  });
});
