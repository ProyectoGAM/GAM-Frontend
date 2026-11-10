import { healthActivity, healthEntry, healthPlan } from '../testing/health-fixtures';
import { healthActivityMatches, healthHistoryRows, healthOccurredAt, healthPlanActivities } from './flock-health';

describe('Flock health rules', () => {
  const plan = { ...healthPlan, baseline_date: '2026-10-01' };
  it('requires an explicit current activity, the matching product and the scheduled calendar date', () => {
    expect(healthActivityMatches(plan, healthActivity, '2026-10-01', 'vaccine-1')).toBe(true);
    expect(healthActivityMatches(plan, healthActivity, '2026-10-02', 'vaccine-1')).toBe(false);
    expect(healthActivityMatches(plan, healthActivity, '2026-10-01', 'vaccine-2')).toBe(false);
    expect(healthActivityMatches(plan, null, '2026-10-01', 'vaccine-1')).toBe(false);
    expect(healthActivityMatches({ ...plan, current_revision: 2 }, healthActivity, '2026-10-01', 'vaccine-1')).toBe(false);
    expect(healthPlanActivities(plan, 'medication')).toEqual([]);
  });
  it('respects week windows, recurrence boundaries and unscheduled activities', () => {
    for (const [activity, date, expected] of [
      [{ timing_kind: 'week', start_day: null, start_week: 2 }, '2026-10-08', true],
      [{ timing_kind: 'week', start_day: null, start_week: 2 }, '2026-10-15', false],
      [{ timing_kind: 'day_recurrence', interval_days: 2, end_day: 5 }, '2026-10-05', true],
      [{ timing_kind: 'day_recurrence', interval_days: 2, end_day: 5 }, '2026-10-06', false],
      [{ timing_kind: 'unscheduled' }, '2026-10-01', false],
    ] as const) {
      const item = { ...healthActivity, ...activity };
      const current = { ...plan, revisions: [{ ...plan.revisions[0], activities: [item] }] };
      expect(healthActivityMatches(current, item, date, 'vaccine-1')).toBe(expected);
    }
  });
  it('rejects invalid dates and builds timestamps independently of device timezone', () => {
    expect(healthOccurredAt('2026-10-01', '08:30')).toBe('2026-10-01T08:30:00-03:00');
    expect(healthOccurredAt('2026-02-30', '08:30')).toBeNull();
    expect(healthOccurredAt('2026-10-01', '24:30')).toBeNull();
    expect(healthActivityMatches(plan, healthActivity, '2026-02-30', 'vaccine-1')).toBe(false);
  });
  it('preserves snapshots, corrections and inherited provenance without displaying quantities', () => {
    const correction = { ...healthEntry, id: 'correction-1', type: 'management_correction', source: 'management_execution_correction',
      occurred_at: '2026-10-21T09:00:00-03:00', module_data: { original_type: 'vaccination', original_id: 'entry-1',
        correction_reason: 'Duplicado', original_snapshot: { product_snapshot: { name: 'Nombre histórico de vacuna' },
          plan_activity_id: 'activity-1', plan_activity_title_snapshot: 'Plan original', notes: 'Observación' } } };
    const rows = healthHistoryRows([healthEntry, correction, { ...healthEntry, id: 'unrelated', type: 'ration_change' }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ correction: true, reason: 'Duplicado', name: 'Nombre histórico de vacuna', origin: 'Plan original' });
    expect(rows[1]).toMatchObject({ corrected: true, name: 'Nombre histórico de vacuna', responsible: 'María', origin: 'Fuera del plan' });
    expect(rows[1]).not.toHaveProperty('quantity');
  });
  it('shows the medicine snapshot in a correction and orders equal instants consistently across offsets', () => {
    const correctedMedicine = { ...healthEntry, id: 'correction-2', type: 'management_correction',
      occurred_at: '2026-10-21T08:00:00-03:00', module_data: { original_type: 'medication', original_id: 'medication-1',
        correction_reason: 'Duplicado', original_snapshot: { medicine_name_snapshot: 'Medicamento histórico', plan_activity_id: null } } };
    const rows = healthHistoryRows([correctedMedicine, { ...healthEntry, occurred_at: '2026-10-21T12:00:00Z' }]);
    expect(rows[0].name).toBe('Nombre histórico de vacuna');
    expect(rows[1]).toMatchObject({ name: 'Medicamento histórico', correction: true, origin: 'Fuera del plan' });
  });
});
