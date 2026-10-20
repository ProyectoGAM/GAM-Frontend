import { EggMetricDay } from './flock-detail.interface';
import { CollectionTrend } from '../types/collection-period.type';

export interface FlockCollection {
  id: string;
  flock_id: string;
  quantity: number;
  occurred_at: string;
  notes: string | null;
  status: 'recorded' | 'cancelled';
  version: number;
}

export interface CollectionPage {
  data: FlockCollection[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface RecordCollectionRequest {
  quantity: number;
  occurred_at?: string;
  notes?: string | null;
}

export interface CollectionOperation {
  operation_id: string;
  collection: FlockCollection;
}

export interface CollectionSummary {
  latestDay: EggMetricDay | null;
  total: number;
  average: number | null;
  trend: CollectionTrend;
  changePercent: number | null;
  averageFrom: string;
  averageTo: string;
}

export interface CollectionPoint {
  date: string;
  from: string;
  dayCount: number;
  total: number;
  quantity: number | null;
  label: string;
}
