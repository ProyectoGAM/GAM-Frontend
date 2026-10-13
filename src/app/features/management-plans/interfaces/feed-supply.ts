export interface FeedSupply {
  id: string;
  product: string;
  quantity: string;
  unit: 'kg' | 'g';
  occurred_at: string;
  status: 'recorded' | 'cancelled';
  notes: string | null;
}

export interface FeedSupplyInput {
  product_id: number;
  quantity: string;
  unit: 'kg' | 'g';
  occurred_at: string;
  notes?: string;
}
