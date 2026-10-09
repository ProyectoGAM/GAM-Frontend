export type WeighingMode = 'individual' | 'group';

export interface DailyWeighingEntry {
  id: string;
  occurred_at: string;
  mode: WeighingMode;
  weight_g: string | null;
  bird_count: number;
  total_weight_g: string;
  average_weight_g: string;
  outside_expected_range: boolean;
}

export interface DailyWeighing {
  id: string;
  flock_id: string;
  date: string;
  status: 'in_progress' | 'closed';
  expected_range: {
    stage: 'chick' | 'adult';
    min_weight_g: string;
    max_weight_g: string;
    unit: 'g';
    reference_version: number;
    source?: 'global' | 'breed';
    breed_id?: number | null;
    breed_version?: number | null;
  } | null;
  version: number;
  represented_bird_count: number;
  total_weight_g: string;
  average_weight_g: string | null;
  anomalous_entry_count: number;
  last_entry: DailyWeighingEntry | null;
}

export interface DailyWeighingDetail extends DailyWeighing {
  entries: DailyWeighingEntry[];
  next_cursor: string | null;
}

export interface DailyWeighingPage {
  data: DailyWeighing[];
  next_cursor: string | null;
}

export type AddDailyWeighingEntry =
  | { mode: 'individual'; weight: string; confirm_out_of_range?: boolean }
  | { mode: 'group'; bird_count: number; total_weight: string; confirm_out_of_range?: boolean };

export interface DeleteDailyWeighingEntry {
  version: number;
  reason: string;
}

export interface DailyWeighingOperation {
  operation_id: string;
  daily_weighing: DailyWeighing;
  entry?: DailyWeighingEntry;
  deleted_entry_id?: string;
}

export interface WeighingDistribution {
  available: boolean;
  reason: 'no_individual_weights' | 'insufficient_sample' | 'zero_variance' | null;
  unit: 'g';
  n: number;
  excluded_individual_count: number;
  mean: number | null;
  sample_stddev: number | null;
  minimum: number | null;
  maximum: number | null;
  uniformity_lower: number | null;
  uniformity_upper: number | null;
  uniformity_percent: number | null;
  bin_width: number | null;
  bins: Array<{ lower: number; upper: number; center: number; count: number; anomalous: number }>;
  curve: Array<{ x: number; density: number }> | null;
}

export interface WeighingSettings {
  adult_from_week: number;
  chick_min_weight_g: string;
  chick_max_weight_g: string;
  adult_min_weight_g: string;
  adult_max_weight_g: string;
  version: number;
}

export interface BreedWeighingSettings {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  version: number;
  range_overrides: {
    chick_min_weight_g: string | null;
    chick_max_weight_g: string | null;
    adult_min_weight_g: string | null;
    adult_max_weight_g: string | null;
  };
  expected_ranges: {
    adult_from_week: number;
    reference_version: number;
    chick: { min_weight_g: string; max_weight_g: string; source: 'global' | 'breed' };
    adult: { min_weight_g: string; max_weight_g: string; source: 'global' | 'breed' };
  } | null;
}

export interface SaveBreedWeighingSettings {
  version: number;
  chick_min_weight_g: string | null;
  chick_max_weight_g: string | null;
  adult_min_weight_g: string | null;
  adult_max_weight_g: string | null;
}

export interface SaveWeighingSettingsRequest {
  version?: number;
  adult_from_week: number;
  unit: 'g';
  chick_min_weight: string;
  chick_max_weight: string;
  adult_min_weight: string;
  adult_max_weight: string;
}
