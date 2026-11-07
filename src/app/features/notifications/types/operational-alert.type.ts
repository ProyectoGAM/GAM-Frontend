import { AlertLevel } from './alert-settings.type';

export type OperationalAlertModule = 'vehicles' | 'farm_structure';
export type OperationalAlertValue = boolean | number | AlertLevel | null;
export type OperationalAlertValues = Partial<Record<string, OperationalAlertValue>>;
