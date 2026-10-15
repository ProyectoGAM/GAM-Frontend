import { PlanActivity } from '../interfaces/management-plan';
import { currentPlanActivityIds, currentPlanPosition } from './management-plan-progress';

const activity = (id: string, overrides: Partial<PlanActivity>): PlanActivity => ({
  id, type: 'weighing', title: id, timing_kind: 'unscheduled', start_day: null, end_day: null,
  start_week: null, end_week: null, interval_days: null, conditional: false, condition: null,
  notes: null, catalog_type: null, catalog_snapshot: null, ...overrides,
});

describe('management plan calendar progress', () => {
  it('uses the plan baseline, day one and Uruguay midnight regardless of device timezone', () => {
    expect(currentPlanPosition('2026-10-07', new Date('2026-10-07T03:00:00Z'))).toEqual({ day: 1, week: 1 });
    expect(currentPlanPosition('2026-10-07', new Date('2026-10-14T02:59:59Z'))).toEqual({ day: 7, week: 1 });
    expect(currentPlanPosition('2026-10-07', new Date('2026-10-14T03:00:00Z'))).toEqual({ day: 8, week: 2 });
    expect(currentPlanPosition('2026-10-08', new Date('2026-10-07T12:00:00Z'))).toBeNull();
    expect(currentPlanPosition('2026-02-30')).toBeNull();
    expect(currentPlanPosition('invalid')).toBeNull();
  });

  it('selects every overlapping activity, including inclusive endpoints and conditional schedules', () => {
    const activities = [
      activity('range', { timing_kind: 'week_range', start_week: 1, end_week: 2 }),
      activity('week', { timing_kind: 'week', start_week: 2 }),
      activity('day', { timing_kind: 'day', start_day: 14, conditional: true, condition: 'Si corresponde' }),
      activity('open', { timing_kind: 'week_range', start_week: 2 }),
      activity('none', {}),
    ];
    expect([...currentPlanActivityIds(activities, 14)]).toEqual(['range', 'week', 'day', 'open']);
    expect([...currentPlanActivityIds(activities, 15)]).toEqual(['open']);
    expect(currentPlanActivityIds(activities, 0).size).toBe(0);
  });

  it('selects recurrence only on scheduled dates from its start, including the last day', () => {
    const activities = [
      activity('daily-end', { timing_kind: 'day_recurrence', start_day: 3, interval_days: 7, end_day: 17 }),
      activity('week-end', { timing_kind: 'day_recurrence', start_day: 3, interval_days: 7, end_week: 3 }),
    ];
    expect(currentPlanActivityIds(activities, 2).size).toBe(0);
    expect(currentPlanActivityIds(activities, 4).size).toBe(0);
    expect([...currentPlanActivityIds(activities, 17)]).toEqual(['daily-end', 'week-end']);
    expect(currentPlanActivityIds(activities, 24).size).toBe(0);
  });

  it('retains the latest ration until the next copied stage without selecting future stages', () => {
    const activities = [
      activity('start', { type: 'ration_change', timing_kind: 'day', start_day: 1 }),
      activity('next', { type: 'ration_change', timing_kind: 'week_range', start_week: 2, end_week: 3 }),
      activity('last', { type: 'ration_change', timing_kind: 'day', start_day: 29 }),
      activity('check', { timing_kind: 'week_range', start_week: 2, end_week: 4 }),
    ];
    expect([...currentPlanActivityIds(activities, 7)]).toEqual(['start']);
    expect([...currentPlanActivityIds(activities, 8)]).toEqual(['next', 'check']);
    expect([...currentPlanActivityIds(activities, 28)]).toEqual(['next', 'check']);
    expect([...currentPlanActivityIds(activities, 29)]).toEqual(['last']);
  });
});
