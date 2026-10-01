export type FlockStatus = 'active' | 'quarantined' | 'finished';

export interface Flock {
  id: string;
  code: string;
  breed_id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  origin: string | null;
  poultry_house_id: number;
  production_unit_id: number;
  initial_quantity: number;
  current_quantity: number;
  entry_date: string;
  established_at: string;
  age_days: number;
  current_week: number;
  is_grouped: boolean;
  status: FlockStatus;
  version: number;
  notes: string | null;
  finalized_at: string | null;
  finalization_reason: string | null;
}

export interface PaginatedFlocks {
  data: Flock[];
  links: Record<string, string | null>;
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface FlockListFilters {
  production_unit_id?: number;
  search?: string;
}

export interface FlockListItem extends Flock {
  poultry_house_name: string;
  entry_date_display: string | null;
}
