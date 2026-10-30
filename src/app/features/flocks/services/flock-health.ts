import { FlockPlan, PlanActivity } from '../../management-plans/interfaces/management-plan';
import { currentPlanActivityIds, currentPlanPosition } from '../../management-plans/services/management-plan-progress';
import { HealthHistoryEntry, HealthHistoryRow } from '../interfaces/flock-health.interface';
import { HealthApplicationKind } from '../types/flock-health.type';

export function healthPlanActivities(plan: FlockPlan | null, kind: HealthApplicationKind): PlanActivity[] {
  return plan?.revisions.find((revision) => revision.number === plan.current_revision)?.activities
    .filter((activity) => activity.type === kind) ?? [];
}

/** A link is explicit, current, for this catalog item, and scheduled on the Uruguay calendar day. */
export function healthActivityMatches(plan: FlockPlan | null, activity: PlanActivity | null, date: string, product: string): boolean {
  if (!plan || !activity || !product || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const instant = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) return false;
  if (!plan.revisions.find((revision) => revision.number === plan.current_revision)?.activities.some((item) => item.id === activity.id)) return false;
  const catalog = activity.catalog_snapshot?.['id'];
  if (catalog != null && String(catalog) !== product) return false;
  const position = currentPlanPosition(plan.baseline_date, instant);
  return position !== null && currentPlanActivityIds([activity], position.day).has(activity.id);
}

export function healthOccurredAt(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  // Lots use America/Montevideo (UTC-03:00); never interpret form input in the device timezone.
  const value = `${date}T${time}:00-03:00`;
  const day = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === date ? value : null;
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;

export function healthHistoryRows(entries: HealthHistoryEntry[]): HealthHistoryRow[] {
  const corrected = new Set(entries.filter((entry) => entry.type === 'management_correction')
    .map((entry) => entry.module_data['original_id']));
  return entries.flatMap((entry): HealthHistoryRow[] => {
    const correction = entry.type === 'management_correction';
    const kind = correction ? entry.module_data['original_type'] : entry.type;
    if (kind !== 'vaccination' && kind !== 'medication') return [];
    const data = correction ? object(entry.module_data['original_snapshot']) : entry.module_data;
    const vaccine = object(data['vaccine'] ?? data['vaccine_snapshot']);
    const product = object(data['product'] ?? data['product_snapshot']);
    const medicine = object(data['medicine']);
    const outsidePlan = correction ? !data['plan_activity_id'] : entry.outside_plan;
    const planTitle = correction ? text(data['plan_activity_title_snapshot']) : entry.plan_activity_title;
    const instant = new Date(entry.occurred_at);
    return [{
      key: `${entry.source}:${entry.id}:${entry.provenance.kind}:${entry.provenance.flock_id}`,
      kind, correction, corrected: !correction && corrected.has(entry.id),
      name: text(kind === 'vaccination' ? product['name'] ?? vaccine['name'] : medicine['name'] ?? data['medicine_name_snapshot']) ?? (kind === 'vaccination' ? 'Vacuna registrada' : 'Medicamento registrado'),
      date: Number.isFinite(instant.getTime()) ? new Intl.DateTimeFormat('es-UY', {
        timeZone: 'America/Montevideo', dateStyle: 'medium', timeStyle: 'short',
      }).format(instant) : 'Fecha no disponible',
      occurredAt: entry.occurred_at,
      responsible: text(entry.responsible?.name) ?? 'Responsable no disponible',
      origin: outsidePlan ? 'Fuera del plan' : planTitle ?? 'Actividad del plan',
      reason: text(correction ? entry.module_data['correction_reason'] : data['reason']),
      notes: text(data['notes']), batch: text(data['vaccine_batch']),
      antecedent: entry.provenance.kind === 'antecedent',
    }];
  }).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || left.key.localeCompare(right.key));
}
