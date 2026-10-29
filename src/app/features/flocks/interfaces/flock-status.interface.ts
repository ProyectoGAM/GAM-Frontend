import { Flock } from './flock.interface';

export interface FlockFinalizationRequest {
  version: number;
  reason: string;
}

export interface FlockStatusRequest extends FlockFinalizationRequest {
  status: Exclude<Flock['status'], 'finished'>;
}

export interface FlockStatusResult {
  operation_id: string;
  flock: Omit<Flock, 'is_grouped'>;
}
