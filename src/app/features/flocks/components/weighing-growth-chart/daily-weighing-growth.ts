import { DailyWeighing } from '../../interfaces/flock-weighing.interface';

export interface GrowthPoint {
  id: string;
  date: string;
  timestamp: number;
  average: number;
  birds: number;
  range: { min: number; max: number } | null;
  outside: boolean;
  inProgress: boolean;
}

export function dailyWeighingGrowth(days: readonly DailyWeighing[]): GrowthPoint[] {
  return days.flatMap((day): GrowthPoint[] => {
    const timestamp = Date.parse(`${day.date}T00:00:00Z`);
    const average = Number(day.average_weight_g);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== day.date
      || day.average_weight_g === null || !Number.isFinite(average) || average <= 0
      || !Number.isInteger(day.represented_bird_count) || day.represented_bird_count <= 0) return [];
    const min = Number(day.expected_range?.min_weight_g);
    const max = Number(day.expected_range?.max_weight_g);
    const range = day.expected_range && Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max > min
      ? { min, max } : null;
    return [{ id: day.id, date: day.date, timestamp, average, birds: day.represented_bird_count,
      range, outside: !!range && (average < range.min || average > range.max), inProgress: day.status === 'in_progress' }];
  }).sort((a, b) => a.timestamp - b.timestamp);
}
