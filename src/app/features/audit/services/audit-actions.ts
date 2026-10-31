import { AuditAction, AuditActor, AuditRecord } from '../interfaces/audit';

const FLOCK_SECTIONS: Readonly<Record<string, { segment: string; label: string; description: string }>> = {
  eggs_collected: { segment: 'recoleccion', label: 'Ir a postura', description: 'Abre una postura vigente para editarla o borrarla, según tus permisos.' },
  egg_collection_corrected: { segment: 'recoleccion', label: 'Ir a postura', description: 'Consulta la postura vigente y sus opciones de edición y borrado.' },
  egg_collection_cancelled: { segment: 'recoleccion', label: 'Ir a postura', description: 'Consulta las posturas del lote. Una postura borrada conserva su historial.' },
  weighing_recorded: { segment: 'pesajes', label: 'Ir a pesajes', description: 'Consulta los pesajes del lote y los ingresos que sigan disponibles.' },
  weighing_corrected: { segment: 'pesajes', label: 'Ir a pesajes', description: 'Consulta los pesajes del lote y los ingresos que sigan disponibles.' },
  daily_weighing_entry_added: { segment: 'pesajes', label: 'Ir a pesajes', description: 'Abre el registro diario para borrar un ingreso individual o grupal, según tus permisos.' },
  daily_weighing_entry_deleted: { segment: 'pesajes', label: 'Ir a pesajes', description: 'Consulta la muestra actualizada y los ingresos que siguen registrados.' },
  daily_weighing_reference_updated: { segment: 'pesajes', label: 'Ir a pesajes', description: 'Consulta el rango y la muestra actuales del lote.' },
  mortality_recorded: { segment: 'mortalidad', label: 'Ir a mortandad', description: 'Consulta los registros y las correcciones disponibles en mortandad.' },
  mortality_corrected: { segment: 'mortalidad', label: 'Ir a mortandad', description: 'Consulta el registro vigente y las correcciones disponibles en mortandad.' },
  mortality_cancelled: { segment: 'mortalidad', label: 'Ir a mortandad', description: 'Consulta los registros actuales de mortandad del lote.' },
  flock_mortality_corrected: { segment: 'mortalidad', label: 'Ir a mortandad', description: 'Consulta los registros actuales de mortandad del lote.' },
  flock_mortality_applied: { segment: 'mortalidad', label: 'Ir a mortandad', description: 'Consulta los registros actuales de mortandad del lote.' },
};
const FEEDING_EVENTS = new Set(['feed_consumption_recorded', 'feed_consumption_corrected', 'flock_feeding_initialized', 'flock_feeding_manual_changed', 'flock_feeding_automatic_restored', 'flock_feeding_plan_revised']);
const HEALTH_EVENTS = new Set(['vaccination_application_recorded', 'medicine_application_recorded']);

/** A historical reference enables navigation, never authorizes a correction. */
export function auditFlockNavigation(entry: AuditRecord): {
  path: string; label: string; section: { path: string; label: string; description: string } | null;
} | null {
  const subject = entry.presentation.subject;
  if (subject.resource !== 'flock' || typeof subject.id !== 'string' || !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(subject.id)) return null;
  const path = `/administracion/lotes/lotes/${encodeURIComponent(subject.id)}`;
  const event = entry.event ?? '';
  const knownSection = Object.hasOwn(FLOCK_SECTIONS, event) ? FLOCK_SECTIONS[event] : undefined;
  const section = knownSection ?? (FEEDING_EVENTS.has(event)
    ? { segment: 'alimentacion', label: 'Ir a alimentación', description: 'Consulta la configuración y los consumos vigentes del lote.' }
    : HEALTH_EVENTS.has(event)
      ? { segment: 'sanidad', label: 'Ir a sanidad', description: 'Consulta las aplicaciones y las correcciones disponibles en sanidad.' } : null);
  return { path, label: subject.label?.trim() || 'Ver lote', section: section ? { path: `${path}/${section.segment}`, label: section.label, description: section.description } : null };
}

export function auditUserLink(actor: AuditActor): string | null {
  return actor.kind === 'person' && actor.exists && actor.can_manage && actor.id !== null
    ? `/administracion/usuarios/${encodeURIComponent(String(actor.id))}` : null;
}
export function supportedAction(action: AuditAction): boolean {
  if (action.kind === 'undo_mortality') {
    return action.target.resource === 'mortality_record'
      && typeof action.target.id === 'string' && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(action.target.id)
      && typeof action.target.flock_id === 'string' && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(action.target.flock_id);
  }
  if (typeof action.target.id !== 'number' || !Number.isSafeInteger(action.target.id) || action.target.id <= 0) return false;
  return action.kind === 'reverse_inventory_movement' && action.target.resource === 'inventory_movement'
    || action.kind === 'correct_feed_consumption' && action.target.resource === 'feed_consumption'
      && typeof action.target.flock_id === 'string' && !!action.target.flock_id.trim();
}
export function sameAction(left: AuditAction, right: AuditAction): boolean {
  return left.kind === right.kind && left.target.resource === right.target.resource
    && left.target.id === right.target.id && left.target.flock_id === right.target.flock_id;
}
