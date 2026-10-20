import { Flock } from './flock.interface';

export interface FlockMortality {
  id: string;
  version: number;
  quantity: number;
  occurred_at: string;
  notes: string | null;
  status: 'recorded' | 'cancelled';
}

export interface MortalityPoint {
  key: string;
  label: string;
  description: string;
  quantity: number;
  records: FlockMortality[];
}
export interface MortalityDraft {
  date: string;
  quantity: number;
  reason: string;
}

export interface MortalitySubmission {
  draft: MortalityDraft;
  excessConfirmation: { version: number; balance: number } | null;
}

export interface RecordMortalityRequest {
  version: number;
  quantity: number;
  occurred_at: string;
  notes: string;
}

export interface MortalityFieldErrors {
  date?: string;
  quantity?: string;
  reason?: string;
}

export interface CancelMortalityRequest {
  version: number;
  flock_version: number;
  reason: string;
  confirm_reactivation?: boolean;
}

export interface MortalityCancellationSubmission {
  recordId: string;
  request: CancelMortalityRequest;
}

export interface MortalityOperation {
  operation_id: string;
  flock: Pick<Flock, 'id' | 'version' | 'current_quantity' | 'status' | 'finalized_at' | 'finalization_reason'>;
  mortality: FlockMortality;
}
