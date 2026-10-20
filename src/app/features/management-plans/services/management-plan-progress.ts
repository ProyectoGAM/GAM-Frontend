import { PlanActivity, PlanPosition } from '../interfaces/management-plan';

const DAY_MS = 86_400_000;
const positiveInteger = (value: number | null): value is number => value !== null && Number.isSafeInteger(value) && value > 0;

function dateTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

/** Plan day 1 is its baseline date, using calendar days in Uruguay rather than device time. */
export function currentPlanPosition(baseline: string, now = new Date()): PlanPosition | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const baselineTime = dateTimestamp(baseline);
  const todayTime = dateTimestamp(`${part('year')}-${part('month')}-${part('day')}`);
  if (baselineTime === null || todayTime === null || baselineTime > todayTime) return null;
  const day = Math.floor((todayTime - baselineTime) / DAY_MS) + 1;
  return { day, week: Math.floor((day - 1) / 7) + 1 };
}

function startDay(activity: PlanActivity): number | null {
  if (activity.timing_kind === 'day' || activity.timing_kind === 'day_recurrence') {
    return positiveInteger(activity.start_day) ? activity.start_day : null;
  }
  if (activity.timing_kind === 'week' || activity.timing_kind === 'week_range') {
    return positiveInteger(activity.start_week) ? (activity.start_week - 1) * 7 + 1 : null;
  }
  return null;
}

function matchesDay(activity: PlanActivity, day: number): boolean {
  const start = startDay(activity);
  if (start === null || day < start) return false;
  switch (activity.timing_kind) {
    case 'day': return day === start;
    case 'week': return day < start + 7;
    case 'week_range': return activity.end_week === null || (positiveInteger(activity.end_week) && day <= activity.end_week * 7);
    case 'day_recurrence': {
      const end = positiveInteger(activity.end_day) ? activity.end_day
        : positiveInteger(activity.end_week) ? activity.end_week * 7 : null;
      return end !== null && day <= end && positiveInteger(activity.interval_days) && (day - start) % activity.interval_days === 0;
    }
    case 'unscheduled': return false;
  }
}

/** Calendar highlighting is independent of execution, conditions and the actual feeding mode. */
export function currentPlanActivityIds(activities: readonly PlanActivity[], day: number): ReadonlySet<string> {
  if (!positiveInteger(day)) return new Set();
  const rationStages = activities.filter((activity) => activity.type === 'ration_change'
    && startDay(activity) !== null && startDay(activity)! <= day);
  const latestRationStart = rationStages.reduce((latest, activity) => Math.max(latest, startDay(activity)!), 0);
  return new Set(activities.filter((activity) => activity.type === 'ration_change'
    ? latestRationStart > 0 && startDay(activity) === latestRationStart
    : matchesDay(activity, day)).map((activity) => activity.id));
}
