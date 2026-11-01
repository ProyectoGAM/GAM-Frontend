import { AuthUser } from '../../../core/auth/auth.types';
import { InstallationMaintenance } from '../interfaces/installation-maintenance.interface';
import { PoultryHouseDetail } from '../interfaces/production-unit.interface';

export const maintenanceUser: AuthUser = {
  id: 1, name: 'Martín Pérez', email: 'martin@example.test', deleted_at: null,
  roles: ['admin'], permissions: ['poultry-houses.view', 'poultry-houses.manage'],
};

export const maintenanceHouse: PoultryHouseDetail = {
  id: 22, production_unit_id: 7, name: 'Galpón Norte', type: 'poultry', status: 'operational', bird_capacity: 6000,
  production_unit: { id: 7, name: 'San José', status: 'active', locality: null },
};

export const maintenanceRecord: InstallationMaintenance = {
  id: 9, poultry_house_id: 22, maintenance_date: '2026-01-01', description: 'Revisión de bebederos',
  cost: { amount: '0.00', currency: 'UYU' }, responsible: { id: 1, name: 'Martín Pérez' },
  status: 'completed', version: 3, cancellation_reason: null, cancelled_at: null,
  created_at: '2026-01-02T12:00:00Z', updated_at: '2026-01-02T12:00:00Z',
};
