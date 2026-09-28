import { PoultryHouseStatus } from '../interfaces/production-unit.interface';

export type HouseStatusFilter = PoultryHouseStatus | 'all';
export type HouseOccupancyFilter = 'all' | 'occupied' | 'empty';

export const houseStatusOptions: readonly { value: HouseStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'operational', label: 'Operativo' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'out_of_service', label: 'Fuera de servicio' },
  { value: 'inactive', label: 'Inactivo' },
];

export const houseOccupancyOptions: readonly { value: HouseOccupancyFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'occupied', label: 'Con aves' },
  { value: 'empty', label: 'Sin aves' },
];
