export interface DetailMetric<T> {
  state: 'loading' | 'ready' | 'unavailable';
  value: T | null;
}

export interface FlockLatestWeighing {
  date: string;
  average_weight_g: string;
}

export interface EggMetricDay {
  date: string;
  quantity: number;
}

export interface EggMetrics {
  total_eggs: number;
  daily_average: number;
  by_day: EggMetricDay[];
}

export interface EggHistorySummary {
  total: number;
  latestDay: EggMetricDay | null;
}
