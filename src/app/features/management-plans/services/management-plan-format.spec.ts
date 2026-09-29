import { PlanActivity } from '../interfaces/management-plan';
import { activityTimingLabel } from './management-plan-format';

const activity = (overrides: Partial<PlanActivity>): PlanActivity => ({
  id: '01J00000000000000000000000', type: 'weighing', title: 'Control', timing_kind: 'unscheduled',
  start_day: null, end_day: null, start_week: null, end_week: null, interval_days: null,
  conditional: false, condition: null, notes: null, catalog_type: null, catalog_snapshot: null,
  ...overrides,
});

describe('relative plan timing', () => {
  it('keeps an open week range and inclusive closed range distinct', () => {
    expect(activityTimingLabel(activity({ timing_kind: 'week_range', start_week: 9 }))).toBe('Desde semana 9 hasta fin de ciclo');
    expect(activityTimingLabel(activity({ timing_kind: 'week_range', start_week: 1, end_week: 7 }))).toBe('Semanas 1–7 (inclusive)');
  });

  it('describes recurrence from its configured start day', () => {
    expect(activityTimingLabel(activity({ timing_kind: 'day_recurrence', start_day: 29, interval_days: 14, end_week: 15 })))
      .toBe('Cada 2 semanas desde día 29 hasta semana 15');
    expect(activityTimingLabel(activity({ timing_kind: 'unscheduled' }))).toBe('Sin fecha prevista');
  });
});
