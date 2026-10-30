import { FlockPlan, PlanActivity } from '../../management-plans/interfaces/management-plan';
import { HealthHistoryEntry } from '../interfaces/flock-health.interface';
import { Flock } from '../interfaces/flock.interface';
import { todayInLotsTimezone } from '../services/flock-detail.service';

export const healthFlock: Flock = {
  id: 'lot-1', code: 'L-024', breed_id: 1, supplier_id: null, supplier_name: null, origin: null,
  poultry_house_id: 3, production_unit_id: 1, initial_quantity: 100, current_quantity: 95,
  entry_date: '2020-01-01', established_at: '2020-01-01T12:00:00-03:00', age_days: 30, current_week: 5,
  is_grouped: false, status: 'active', version: 1, notes: null, finalized_at: null, finalization_reason: null,
};
export const healthActivity: PlanActivity = {
  id: 'activity-1', type: 'vaccination', title: 'Vacunación programada', timing_kind: 'day', start_day: 1,
  end_day: null, start_week: null, end_week: null, interval_days: null, conditional: false, condition: null,
  notes: null, catalog_type: 'vaccine', catalog_snapshot: { id: 'vaccine-1', name: 'Vacuna A' },
};
export const healthPlan: FlockPlan = {
  id: 'plan-1', flock_id: 'lot-1', baseline_date: todayInLotsTimezone(), current_revision: 1,
  source_template: null, source_flock_id: null,
  revisions: [{ id: 'revision-1', number: 1, reason: null, created_at: null, activities: [healthActivity] }],
};
export const healthEntry: HealthHistoryEntry = {
  id: 'entry-1', type: 'vaccination', source: 'vaccination_application', occurred_at: '2026-10-20T10:00:00-03:00',
  outside_plan: true, plan_activity_title: null, responsible: { name: 'María', user_id: 1 },
  provenance: { kind: 'direct', flock_id: 'lot-1' },
  module_data: { product: { name: 'Nombre histórico de vacuna' }, vaccine: { id: 'vaccine-1' }, reason: 'Fuera del plan', notes: 'Observación' },
};
