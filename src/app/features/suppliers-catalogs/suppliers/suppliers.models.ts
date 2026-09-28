export type SupplierStatus = 'active' | 'inactive';

export interface SupplierLocality {
  id: number;
  name: string;
  department: { id: number; name: string };
}

export interface Supplier {
  id: number;
  name: string;
  address: string;
  status: SupplierStatus;
  locality: SupplierLocality | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierListFilters {
  search?: string;
  status?: SupplierStatus;
  per_page?: number;
}

export interface SupplierListResponse {
  data: Supplier[];
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
}

export interface StoreSupplierRequest {
  name: string;
  address: string;
  locality_id?: number | null;
}

export interface UpdateSupplierRequest {
  name?: string;
  address?: string;
  locality_id?: number | null;
}

export interface StoreSupplierResponse {
  data: Supplier;
}
