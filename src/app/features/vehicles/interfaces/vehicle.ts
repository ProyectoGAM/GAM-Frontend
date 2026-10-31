import { VehicleAvailability, VehicleMaintenanceState, VehicleStatus } from '../types/vehicle.types';

export interface Vehicle {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  admitted_at: string | null;
  status: VehicleStatus;
  status_reason: string | null;
  capacity_kg: string | null;
  habitual_driver: { id: number; name: string } | null;
  notes: string | null;
  version: number;
  availability: VehicleAvailability;
  availability_reason: string | null;
  maintenance_warnings: string[];
  latest_odometer: string | null;
  latest_odometer_at: string | null;
}

export interface VehicleOption {
  id: string;
  plate: string;
  make: string;
  model: string;
  availability: 'available';
  warnings: string[];
}

export interface VehicleDriverOption {
  id: number;
  name: string;
}

export interface VehicleUsage {
  id: string;
  purpose: string;
  driver_snapshot: string | null;
  started_at: string;
  ended_at: string | null;
  start_odometer_km: string | null;
  end_odometer_km: string | null;
  vehicle_snapshot: Pick<Vehicle, 'id' | 'plate' | 'make' | 'model' | 'year'>;
  delivery_id: string | null;
}

export interface VehicleReading {
  id: string;
  meter_type: 'odometer';
  event_type: 'reading' | 'correction' | 'reset';
  event_reason: string | null;
  corrects_reading_id: string | null;
  value: string;
  recorded_at: string;
  received_at: string;
  source: string;
  notes: string | null;
  correction_reason: string | null;
}

export interface VehicleStatusChange {
  id: string;
  from_status: VehicleStatus | null;
  to_status: VehicleStatus;
  reason: string;
  occurred_at: string;
  actor_name: string | null;
}

export interface VehicleFuelEntry {
  id: string;
  occurred_at: string;
  liters: string;
  fuel_type: string;
  amount: string;
  currency: 'UYU';
  supplier: string | null;
  odometer_km: string | null;
  notes: string | null;
  receipt_url: string | null;
  receipt_name: string | null;
}

export interface VehicleFuelInput {
  vehicle_id: string;
  usage_id: string;
  liters: string;
  fuel_type: string;
  amount: string;
  occurred_at: string;
  supplier?: string;
  odometer_km?: string;
  notes?: string;
  receipt?: File;
}

export interface VehicleMaintenancePlan {
  id: string;
  task: string;
  interval_days: number | null;
  interval_km: string | null;
  next_due_at: string | null;
  next_due_odometer_km: string | null;
  status: 'current' | 'upcoming' | 'overdue' | 'insufficient_data';
  version: number;
}

export interface VehicleMaintenanceItem {
  id: number;
  public_id: string;
  plan_id: number | null;
  task: string;
  completed: boolean;
  notes: string | null;
}

export interface VehicleMaintenanceDocument {
  id: string;
  title: string;
  original_name: string;
  download_url: string;
}

export interface VehicleMaintenance {
  id: string;
  type: 'preventive' | 'corrective';
  status: VehicleMaintenanceState;
  immobilizes_vehicle: boolean;
  workshop: string | null;
  description: string;
  planned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  odometer_km: string | null;
  cost_amount: string;
  cost_currency: 'UYU';
  version: number;
  items: VehicleMaintenanceItem[];
  documents: VehicleMaintenanceDocument[];
}

export interface VehicleDocument {
  id: string;
  type: string;
  title: string;
  expires_at: string | null;
  original_name: string;
  download_url: string;
}

export interface VehicleDetail {
  data: Vehicle;
  status_changes: VehicleStatusChange[];
  usages: VehicleUsage[];
  readings: VehicleReading[];
  fuel_entries: VehicleFuelEntry[];
  maintenance_plans: VehicleMaintenancePlan[];
  maintenances: VehicleMaintenance[];
  documents: VehicleDocument[];
  availability: { availability: VehicleAvailability; reason: string | null; warnings: string[] };
}

export interface VehicleListResponse {
  data: Vehicle[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface VehicleEnvelope { data: Vehicle; }
