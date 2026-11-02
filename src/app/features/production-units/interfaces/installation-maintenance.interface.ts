import { InstallationMaintenanceStatus } from '../types/installation-maintenance.type';

export interface InstallationMaintenance {
  id: number;
  poultry_house_id: number;
  maintenance_date: string;
  description: string;
  cost: { amount: string; currency: string };
  responsible: { id: number; name: string };
  status: InstallationMaintenanceStatus;
  version: number;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceInput {
  maintenance_date: string;
  description: string;
  cost_amount: string;
  cost_currency: 'UYU';
  responsible_user_id: number;
}

export interface MaintenanceCorrection extends Partial<MaintenanceInput> {
  version: number;
  reason: string;
}

export interface MaintenanceFilters {
  status?: InstallationMaintenanceStatus;
  date_from?: string;
  date_to?: string;
}

export interface MaintenancePage {
  data: InstallationMaintenance[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface MaintenanceCostTotal {
  amount: string;
  currency: string;
}
