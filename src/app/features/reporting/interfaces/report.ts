export interface ReportField {
  label: string;
  type: string;
  unit?: string;
}

export interface ReportFilterDefinition extends ReportField {
  operators: string[];
  options?: string[];
  options_source?: string;
}

export interface ReportQuery {
  columns?: string[];
  filters?: { field: string; operator: string; value: string | number | boolean | (string | number | boolean)[] }[];
  from?: string | null;
  to?: string | null;
  sorts?: { field: string; direction: 'asc' | 'desc' }[];
  groupings?: string[];
  metrics?: string[];
  page?: number;
  per_page?: number;
}

export interface ReportSource {
  key: string;
  definition_version: string;
  label: string;
  description: string;
  columns: Record<string, ReportField>;
  filters: Record<string, ReportFilterDefinition>;
  groupings: Record<string, ReportField>;
  metrics: Record<string, ReportField>;
  sorts: Record<string, { label: string; direction: string }>;
  default_sort: string;
  default_columns: string[];
  standard_queries: { label: string; configuration: ReportQuery }[];
  supports_date_range: boolean;
  formats: ('xlsx' | 'pdf')[];
  limits: { max_page_size: number; max_range_days: number; max_export_rows: number };
  format_limits: Record<string, number>;
  capabilities: { export: boolean; share: boolean; presets: boolean };
}

export interface ReportResult {
  source_key: string;
  definition_version: string;
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
  units: Record<string, string | null>;
  pagination: { current_page: number; per_page: number; total: number; last_page: number };
  generated_at: string;
}

export interface ReportPreset {
  id: number;
  name: string;
  source_key: string;
  definition_version: string;
  configuration: ReportQuery;
}

export interface ReportExport {
  id: number;
  source_key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  format: 'xlsx' | 'pdf';
  file_name: string;
  expires_at: string | null;
  failure_message: string | null;
}

export interface ReportOptions {
  data: { value: string | number | boolean; label: string }[];
  pagination: { current_page: number; last_page: number; total: number };
}

export interface ReportEnvelope<T> { data: T }
export interface ReportPage<T> extends ReportEnvelope<T[]> {
  meta: { current_page: number; last_page: number; total: number };
}
