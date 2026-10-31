export interface AuditActor {
  type: string | null;
  id: number | string | null;
  kind: 'person' | 'system' | 'unavailable';
  name: string | null;
  current_name: string | null;
  exists: boolean;
  status: 'active' | 'disabled' | 'system' | 'unavailable';
  can_manage: boolean;
}

export interface AuditActorOption extends Omit<AuditActor, 'id'> {
  value: number | string | null;
  label: string;
}

export interface AuditSummary {
  title: string;
  summary: string;
  subject: { label: string | null; resource: string | null; id: string | number | null };
  production_unit: { id: number; name: string } | null;
}

export interface AuditRecord {
  id: number;
  event: string | null;
  created_at: string | null;
  actor: AuditActor;
  presentation: AuditSummary;
}

export interface AuditEntry extends AuditRecord {
  log_name: string | null;
  source: string | null;
}

export interface AuditFact { label: string; value: string }
export interface AuditChange { label: string; before: string | null; after: string | null }

// Unknown kinds remain visible but never become executable commands.
export interface AuditAction {
  kind: string;
  label: string;
  available: boolean;
  reason: string | null;
  target: { resource: string; id: number | string; flock_id?: string; production_unit_id?: number };
}

export interface AuditDetail extends AuditRecord {
  presentation: AuditSummary & {
    facts: AuditFact[];
    changes: AuditChange[];
    changes_state: 'presented' | 'partial' | 'unavailable' | 'not_recorded';
    history: { state: 'complete' | 'partial'; missing: string[] };
    reversibility: { state: 'available' | 'irreversible' | 'unavailable' | 'unknown'; reason: string };
    actions: AuditAction[];
  };
}

export interface AuditFilters {
  log_name?: string;
  event?: string;
  source?: string;
  actor_kind?: AuditActor['kind'];
  actor_type?: string;
  actor_id?: number | string;
  up_id?: number;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

export interface AuditPagination {
  current_page: number; last_page: number; total: number; per_page: number;
  from: number | null; to: number | null;
}
export interface AuditPage { data: AuditEntry[]; meta: AuditPagination }
export interface AuditActorPage { data: AuditActorOption[]; meta: AuditPagination }
export interface AuditOption { value: string | number; label: string }
export interface AuditOptions {
  audit: { events: AuditOption[]; sources: AuditOption[] };
  production_units: AuditOption[];
  products?: AuditOption[];
  stock_locations?: AuditOption[];
}
