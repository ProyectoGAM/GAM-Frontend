export type DeliveryStatus = 'active' | 'completed' | 'cancelled';
export type DeliveryStopStatus = 'pending' | 'delivered' | 'not_delivered';

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
  type: string;
  created_at: string;
}

export interface DeliveryUnit {
  id: string;
  label: string;
  category: string;
  eggs_per_unit: number;
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

export interface DeliveryStopItem extends DeliveryLoadItemInput {
  label: string;
  eggs: number;
}

export interface DeliveryUnitBalanceRow {
  unit: string;
  label: string;
  eggs_per_unit: number;
  loaded_amount: string;
  delivered_amount: string;
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
}

export interface StartDeliveryInput {
  pin: string;
  quantity?: number; // Compatibilidad con clientes anteriores.
  items?: DeliveryLoadItemInput[];
  production_unit_id?: number;
  vehicle_reference?: string;
}

export interface AddDeliveryLoadInput {
  quantity?: number; // Compatibilidad con operaciones ya encoladas.
  items?: DeliveryLoadItemInput[];
}

export interface StopInput {
  client_reference: string;
  status: DeliveryStopStatus;
  items?: DeliveryLoadItemInput[];
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
  returned_quantity: number;
  notes?: string;
}
