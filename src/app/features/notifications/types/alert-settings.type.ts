export type AlertTimingType =
  | 'daily_egg_collection_missing'
  | 'manual_feeding_review_due'
  | 'vaccination_due'
  | 'medication_due'
  | 'beak_trimming_due'
  | 'manual_practice_due'
  | 'flock_movement_due'
  | 'egg_collection_due'
  | 'mortality_due';

export type AlertRuleId = AlertTimingType | 'feed_coverage';
export type AlertRuleKind = 'scheduled' | 'daily' | 'feeding-review' | 'coverage';
export type AlertLevel = 'bajo' | 'medio' | 'alto';
export type AlertMoment = 'off' | 'before' | 'on-date' | 'after';
