import { HealthApplicationKind } from '../types/flock-health.type';

export interface HealthApplicationRequest {
  occurred_at: string;
  plan_activity_id?: string;
  reason?: string;
  notes?: string;
  vaccine_id?: string;
  medicine_id?: string;
  vaccine_batch?: string;
}

export interface HealthApplicationDraft {
  kind: HealthApplicationKind;
  body: HealthApplicationRequest;
}

export interface HealthOperation {
  operation_id: string;
  vaccination_application?: { id: string };
  medicine_application?: { id: string };
}

export interface HealthHistoryEntry {
  id: string;
  type: string;
  source: string;
  occurred_at: string;
  outside_plan: boolean;
  plan_activity_title: string | null;
  responsible: { name: string | null; user_id: number | null };
  provenance: { kind: 'direct' | 'antecedent'; flock_id: string };
  module_data: Record<string, unknown>;
}

export interface HealthHistoryPage {
  data: HealthHistoryEntry[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface HealthHistoryRow {
  key: string;
  kind: HealthApplicationKind;
  correction: boolean;
  corrected: boolean;
  name: string;
  date: string;
  occurredAt: string;
  responsible: string;
  origin: string;
  reason: string | null;
  notes: string | null;
  batch: string | null;
  antecedent: boolean;
}
