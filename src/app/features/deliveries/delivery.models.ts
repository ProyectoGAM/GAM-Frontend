export type DeliveryStatus = 'active' | 'completed' | 'cancelled';
export type DeliveryStopStatus = 'pending' | 'delivered' | 'not_delivered';

export interface DeliveryProductionUnit {
  id: number;
  name: string;
}

export interface DeliveryClient {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
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
  driver: { id: number; name: string } | null;
  production_unit: { id: number; name: string; latitude?: number | string | null; longitude?: number | string | null } | null;
  vehicle_reference: string | null;
  loaded_quantity: number;
  delivered_quantity: number;
  returned_quantity: number;
  returned_items?: DeliveryStopItem[] | null;
  return_production_unit?: DeliveryProductionUnit | null;
  delivered_amount?: string | null;
  currency?: 'UYU';
  remaining_quantity: number;
  stops_summary: { total: number; pending: number; delivered: number; not_delivered: number };
  started_at: string;
  closed_at: string | null;
  latest_location: DeliveryLocation | null;
  stops?: DeliveryStop[];
  loads?: DeliveryLoad[];
  unit_balances?: DeliveryUnitBalances;
  locations?: DeliveryLocation[];
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
  quantity?: number; // Compatibilidad con clientes anteriores.
  items?: DeliveryLoadItemInput[];
  production_unit_id?: number;
  vehicle_reference?: string;
}

export interface AddDeliveryLoadInput {
  production_unit_id?: number; // Operaciones anteriores de la cola no incluyen origen.
  quantity?: number; // Compatibilidad con operaciones ya encoladas.
  items?: DeliveryLoadItemInput[];
}

export interface StopInput {
  client_reference: string;
  status: DeliveryStopStatus;
  items?: DeliveryStopItemInput[];
  visit_reason?: string;
  notes?: string;
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
}
