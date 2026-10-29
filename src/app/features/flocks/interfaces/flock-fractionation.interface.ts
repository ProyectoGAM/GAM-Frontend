import { PoultryHouse } from '../../production-units/interfaces/production-unit.interface';
import { Flock } from './flock.interface';

export interface FractionationContext {
  source: Flock;
  unitName: string;
  houses: PoultryHouse[];
  flocks: Flock[];
}

export interface FractionationDraft {
  kind: 'partial' | 'total';
  destination: 'empty' | 'existing';
  target: string;
  quantity: string;
  code: string;
  occurredAt: string;
  reason: string;
}

export interface FractionationRequest {
  version: number;
  quantity: number;
  destination_poultry_house_id?: number;
  destination_flock_id?: string;
  destination_version?: number;
  destination_code?: string;
  occurred_at?: string;
  reason?: string;
}

export interface FractionationResult {
  operation_id: string;
  destination_flock: { id: string; code: string };
}

export interface FractionationTarget {
  value: string;
  label: string;
  description: string;
  house: PoultryHouse;
  flock?: Flock;
}
