export type PlanTimingKind = 'day' | 'week' | 'week_range' | 'day_recurrence' | 'unscheduled';

export interface PlanActivity {
  id: string;
  type: string;
  title: string;
  timing_kind: PlanTimingKind;
  start_day: number | null;
  end_day: number | null;
  start_week: number | null;
  end_week: number | null;
  interval_days: number | null;
  conditional: boolean;
  condition: string | null;
  notes: string | null;
  catalog_type: 'vaccine' | 'medicine' | 'product' | null;
  catalog_snapshot: Record<string, unknown> | null;
}

export interface PlanTemplate {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'retired';
  current_version: number;
  published_version: number | null;
  version_status: 'draft' | 'published' | 'retired';
  activities: PlanActivity[];
}

export interface PlanRevision {
  id: string;
  number: number;
  reason: string | null;
  created_at: string | null;
  activities: PlanActivity[];
}

export interface FlockPlan {
  id: string;
  flock_id: string;
  baseline_date: string;
  current_revision: number;
  source_template: { id: string; version: number; name_at_assignment: string } | null;
  source_flock_id: string | null;
  revisions: PlanRevision[];
}

export interface FlockSummary {
  id: string;
  code: string;
  entry_date: string | null;
  status: 'active' | 'quarantined' | 'finished';
}

export interface PlanPage<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface PlanEnvelope<T> { data: T }
