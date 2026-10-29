import { CustomerStatus, PaymentMethod, CustomerMovementType, AccountSituation } from '../types/customer.types';

export interface CustomerAccountSnapshot {
  balance: string;
  debt: string;
  credit: string;
  currency: 'UYU';
  version: number;
  as_of: string;
}

export interface CustomerInput {
  name?: string | null;
  business_name?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  phone?: string | null;
  email?: string | null;
  locality_id?: number | null;
  address?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  visit_frequency?: string | null;
  commercial_conditions?: string | null;
  notes?: string | null;
  delivery_notes?: string | null;
}

export interface Customer extends CustomerInput {
  id: string;
  display_name: string;
  status: CustomerStatus;
  has_location: boolean;
  ready_for_delivery: boolean;
  created_at: string;
  updated_at: string;
  locality?: { id: number; name: string; department_id: number } | null;
  account?: CustomerAccountSnapshot;
}

export interface Pagination {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface CustomerListFilters {
  search?: string;
  status?: CustomerStatus;
  account_status?: AccountSituation;
  per_page?: number;
}

export interface Paginated<T> {
  data: T[];
  meta: Pagination;
  links?: Record<string, string | null>;
}

export interface CustomerEnvelope { data: Customer; }

export interface CustomerPaymentInput {
  amount: string;
  payment_method: PaymentMethod;
  payment_reference?: string | null;
  reason?: string | null;
}

export interface CustomerAdjustmentInput {
  direction: 'increase' | 'decrease';
  amount: string;
  reason: string;
  expected_version: number;
}

export interface CustomerMovement {
  id: string;
  type: CustomerMovementType;
  sequence: number;
  amount: string;
  balance_before: string;
  balance_after: string;
  currency: 'UYU';
  customer_name: string;
  customer_id?: string;
  reason: string | null;
  actor: { name: string };
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  occurred_at: string;
  created_at: string;
  operation_id: string;
  delivery_id?: string | null;
  delivery_stop_id: number | null;
  reversal_id?: string | null;
  reverses_movement_id?: string | null;
}

export interface CustomerStatement {
  opening_balance: string;
  closing_balance: string;
  currency: 'UYU';
  version: number;
  from: string | null;
  to: string | null;
}

export interface CustomerMovementPage extends Paginated<CustomerMovement> { statement: CustomerStatement; }
export interface CustomerMovementResult { data: CustomerMovement[]; operation_id?: string; }
export interface MovementFilters { from?: string; to?: string; type?: CustomerMovementType; per_page?: number; }
