export interface BeakTrimmingRequest {
  practice_type: 'beak_trimming';
  occurred_at: string;
  plan_activity_id?: string;
  notes?: string;
}

export interface BeakTrimmingRow {
  id: string;
  occurredAt: string;
  date: string;
  responsible: string;
  planTitle: string | null;
  notes: string | null;
  antecedent: boolean;
  reversal: { date: string; responsible: string; reason: string | null } | null;
}

export type BeakTrimmingCommand =
  | { kind: 'record'; body: BeakTrimmingRequest }
  | { kind: 'reverse'; id: string; body: { reason: string } };
