import type { CustomerAccountSnapshot, CustomerMovement, CustomerPaymentInput } from '../customers/interfaces/customer';

export type DeliveryStatus = 'active' | 'completed' | 'cancelled';
export type DeliveryStopStatus = 'pending' | 'delivered' | 'not_delivered';

export interface DeliveryProductionUnit {
  id: number;
  name: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface DeliveryClient {
  id: string;
  name: string;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  status?: 'active' | 'inactive';
  ready_for_delivery?: boolean;
  delivery_notes?: string | null;
  visit_frequency?: string | null;
  account?: CustomerAccountSnapshot;
  last_delivery?: { id: number; delivery_id: string; visited_at: string; delivered_quantity: number; total_amount: string | null; items?: DeliveryStopItem[] } | null;
  visit_status?: 'pending' | 'visited' | 'delivered' | 'paid';
}

export interface DeliveryStop {
  id: number;
  client_reference: string;
  client_name: string;
  address: string;
  latitude: number | string;
  longitude: number | string;
  sequence: number;
  status: DeliveryStopStatus;
  delivered_quantity: number;
  total_amount?: string | null;
  currency?: 'UYU';
  items?: DeliveryStopItem[] | null;
  visit_reason: string | null;
  notes: string | null;
  visited_at: string | null;
  created_at?: string;
  delivery_id?: string;
  accounting_status?: 'legacy_unreconciled' | 'posted' | 'not_applicable';
  account_movements?: CustomerMovement[];
}

export interface DeliveryLocation {
  id: number | string;
  client_event_id?: string;
  latitude: number | string;
  longitude: number | string;
  accuracy: number | null;
  speed: number | null;
  captured_at: string;
  received_at: string;
}

export interface DeliveryLoad {
  id: number;
  idempotency_key?: string;
  quantity: number;
  items?: DeliveryLoadItem[];
  production_unit?: DeliveryProductionUnit | null;
  type: string;
  created_at: string;
  occurred_at?: string;
}

export interface DeliveryUnit {
  id: string;
  label: string;
  category: string;
  eggs_per_unit: number;
  default_unit_price?: number | null;
  currency?: 'UYU';
}

export interface DeliveryLoadItemInput {
  unit: string;
  amount: string;
  eggs_per_unit: number;
}

export interface DeliveryLoadItem extends DeliveryLoadItemInput {
  label: string;
  category: string;
  eggs: number;
}

export interface DeliveryStopItemInput extends DeliveryLoadItemInput {
  unit_price?: number;
}

export interface DeliveryStopItem extends DeliveryStopItemInput {
  line_amount?: string | null;
  label: string;
  eggs: number;
}

export interface DeliveryUnitBalanceRow {
  unit: string;
  label: string;
  eggs_per_unit: number;
  loaded_amount: string;
  delivered_amount: string;
  returned_amount?: string;
  remaining_amount: string | null;
  loaded_eggs: number;
  delivered_eggs: number;
}

export interface DeliveryUnitBalances {
  rows: DeliveryUnitBalanceRow[];
  unallocated_delivered_eggs: number;
  unallocated_returned_eggs: number;
}

export interface Delivery {
  id: string;
  status: DeliveryStatus;
  started_without_load?: boolean;
  driver: { id: number; name: string } | null;
  production_unit: DeliveryProductionUnit | null;
  vehicle_reference: string | null;
  vehicle?: { id: string; plate: string; make: string; model: string; year: number | null } | null;
  vehicle_usage?: {
    id: string;
    started_at: string;
    ended_at: string | null;
    start_odometer_km: string | null;
    end_odometer_km: string | null;
    distance_km: string | null;
    fuel_entries?: DeliveryFuelEntry[];
  } | null;
  loaded_quantity: number;
  delivered_quantity: number;
  returned_quantity: number;
  returned_items?: DeliveryStopItem[] | null;
  return_production_unit?: DeliveryProductionUnit | null;
  financial_summary?: DeliveryFinancialSummary;
  closed_financial_summary?: DeliveryFinancialSummary | null;
  account_movements?: CustomerMovement[];
  delivered_amount?: string | null;
  currency?: 'UYU';
  remaining_quantity: number;
  stops_summary: { total: number; pending: number; delivered: number; not_delivered: number };
  started_at: string;
  closed_at: string | null;
  close_notes?: string | null;
  latest_location: DeliveryLocation | null;
  stops?: DeliveryStop[];
  loads?: DeliveryLoad[];
  unit_balances?: DeliveryUnitBalances;
  locations?: DeliveryLocation[];
}

export interface DeliveryFuelEntry {
  id: string;
  occurred_at: string;
  liters: string;
  fuel_type: string;
  amount: string;
  currency: 'UYU';
  supplier: string | null;
  odometer_km: string | null;
  notes: string | null;
}

export interface DeliveryListResponse {
  data: Delivery[];
  links?: Record<string, string | null>;
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface DeliveryEnvelope {
  data: Delivery;
  catalog?: DeliveryUnit[];
}

export interface StartDeliveryInput {
  pin: string;
  vehicle_id: string;
  odometer_km?: string;
  start_without_load?: boolean;
  quantity?: number; // Compatibilidad con clientes anteriores.
  items?: DeliveryLoadItemInput[];
  production_unit_id?: number;
  vehicle_reference?: string;
}

export interface AddDeliveryLoadInput {
  occurred_at?: string;
  production_unit_id?: number; // Operaciones anteriores de la cola no incluyen origen.
  quantity?: number; // Compatibilidad con operaciones ya encoladas.
  items?: DeliveryLoadItemInput[];
}

export interface DeliveryFinancialSummary {
  currency: 'UYU';
  merchandise_amount: string | null;
  collected_amount: string | null;
  recorded_collected_amount: string;
  account_delta: string;
  by_method: { cash: string; transfer: string; other: string };
  legacy_unreconciled_count: number;
  customers: { customer_id: string; customer_name: string; merchandise_amount: string; collected_amount: string; account_delta: string; balance_before: string; balance_after: string }[];
}

export interface DeliveryPaymentInput extends CustomerPaymentInput {
  client_reference: string;
  client_event_id: string;
  occurred_at?: string;
}

export interface DeliveryClientPage {
  data: DeliveryClient[];
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface StopInput {
  accounting_version?: 2;
  client_event_id?: string;
  payment?: { amount: string; payment_method?: CustomerPaymentInput['payment_method']; payment_reference?: string };
  client_reference: string;
  status: DeliveryStopStatus;
  items?: DeliveryStopItemInput[];
  visit_reason?: string;
  notes?: string;
  occurred_at?: string;
}

export interface LocationInput {
  client_event_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number | null;
  captured_at: string;
}

export interface CloseDeliveryInput {
  pin: string;
  returned_quantity?: number; // Compatibilidad con cierres anteriores sin desglose.
  returned_items?: DeliveryLoadItemInput[];
  return_production_unit_id?: number;
  notes?: string;
  odometer_km?: string;
}
