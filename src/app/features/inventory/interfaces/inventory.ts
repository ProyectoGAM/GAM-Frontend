export type ProductKind =
  | 'raw_material'
  | 'supply'
  | 'finished_feed'
  | 'egg'
  | 'medicine'
  | 'vaccine'
  | 'other';

export type ProductStatus = 'active' | 'inactive';
export type BaseUnit = 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'dose';
export type StockLocationStatus = 'active' | 'inactive';
export type InventoryMovementType =
  | 'opening_balance'
  | 'receipt'
  | 'issue'
  | 'loss'
  | 'adjustment'
  | 'transfer'
  | 'reversal';

export interface Product {
  id: number;
  sku: string;
  name: string;
  kind: ProductKind;
  base_unit: BaseUnit;
  stock_tracked: boolean;
  status: ProductStatus;
}

export interface StockLocationProductionUnitSummary {
  id: number;
  name: string;
  status?: 'active' | 'inactive';
}

export interface StockLocation {
  id: number;
  name: string;
  production_unit?: StockLocationProductionUnitSummary | null;
  status: StockLocationStatus;
  created_at?: string;
  updated_at?: string;
}

export interface StockBalance {
  id: number;
  product_id: number;
  stock_location_id: number;
  product: Product;
  stock_location: StockLocation;
  available_quantity: string;
  minimum_quantity: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  status?: 'active' | 'inactive';
}

export interface InventoryMovementLine {
  id: number;
  product_id: number;
  product?: Product;
  stock_location_id: number;
  unit: BaseUnit;
  physical_delta: string;
}

export interface InventoryMovement {
  id: number;
  operation_id: string;
  type: InventoryMovementType;
  supplier?: Supplier | null;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  occurred_at: string;
  created_by: number;
  reverses_movement_id: number | null;
  lines?: InventoryMovementLine[];
  created_at: string;
}

export interface PaginationLinks {
  first: string | null;
  last: string | null;
  prev: string | null;
  next: string | null;
}

export interface PaginationMeta {
  current_page: number;
  from: number | null;
  last_page: number;
  links?: Array<{ url: string | null; label: string; active: boolean }>;
  path?: string;
  per_page: number;
  to: number | null;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  links: PaginationLinks;
  meta: PaginationMeta;
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface OptionValue<T extends number | string = number> {
  value: T;
  label: string;
}

export interface ReferenceOptions {
  production_units: OptionValue[];
  suppliers: OptionValue[];
  products: OptionValue[];
  stock_locations: OptionValue[];
  types: {
    products: OptionValue<string>[];
    base_units: OptionValue<string>[];
    movements: OptionValue<string>[];
  };
  statuses: {
    production_units: OptionValue<string>[];
    products: OptionValue<string>[];
    stock_locations: OptionValue<string>[];
  };
}

export interface InventoryBalanceFilters {
  product_id?: number;
  stock_location_id?: number;
  below_minimum?: boolean;
  per_page?: number;
  page?: number;
}

export interface InventoryMovementFilters {
  type?: InventoryMovementType;
  product_id?: number;
  stock_location_id?: number;
  supplier_id?: number;
  from?: string;
  to?: string;
  per_page?: number;
  page?: number;
}

export interface StockLocationFilters {
  search?: string;
  status?: StockLocationStatus;
  production_unit_id?: number;
  per_page?: number;
  page?: number;
}

export interface MovementLineInput {
  product_id: number;
  stock_location_id: number;
  quantity: string;
}

export interface ReceiptInput {
  supplier_id: number;
  lines: MovementLineInput[];
  occurred_at?: string;
  reason?: string;
  reference_type?: string;
  reference_id?: string;
}

export interface IssueInput {
  lines: MovementLineInput[];
  occurred_at?: string;
  reason?: string;
  reference_type?: string;
  reference_id?: string;
}

export interface LossInput {
  lines: MovementLineInput[];
  reason: string;
  occurred_at?: string;
}

export interface AdjustmentLineInput {
  product_id: number;
  stock_location_id: number;
  counted_quantity: string;
}

export interface AdjustmentInput {
  lines: AdjustmentLineInput[];
  reason: string;
  occurred_at?: string;
}

export interface TransferLineInput {
  product_id: number;
  from_stock_location_id: number;
  to_stock_location_id: number;
  quantity: string;
}

export interface TransferInput {
  lines: TransferLineInput[];
  reason?: string;
  occurred_at?: string;
}

export interface EggBalance {
  production_unit_id: number;
  balance: number;
}

export type EggStockMovementType =
  | 'collection_receipt'
  | 'manual_receipt'
  | 'distribution_preparation'
  | 'loss';

export type EggStockStatus = 'recorded' | 'cancelled';

export interface EggStockRevision {
  id: string;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  correction_reason: string;
  operation_id: string;
  created_by: number;
  created_at: string;
}

export interface EggStockTransaction {
  id: string;
  production_unit_id: number;
  type: EggStockMovementType;
  quantity: number;
  occurred_at: string;
  reason: string;
  notes: string | null;
  status: EggStockStatus;
  version: number;
  reference: { type: string; id: string } | null;
  inventory_references?: number[];
  balance?: number;
  revisions?: EggStockRevision[];
}

export interface EggStockFilters {
  status?: EggStockStatus;
  type?: EggStockMovementType;
  date_from?: string;
  date_to?: string;
  per_page?: number;
  page?: number;
}

export interface EggStockReceiptInput {
  quantity: number;
  occurred_at?: string;
  reason: string;
  notes?: string;
}

export interface EggStockIssueInput {
  quantity: number;
  type: 'distribution_preparation' | 'loss';
  occurred_at?: string;
  reason: string;
  notes?: string;
}

export interface EggStockCorrectionInput {
  version: number;
  quantity?: number;
  occurred_at?: string;
  correction_reason: string;
  reason?: string;
  notes?: string;
}

export interface EggStockCancellationInput {
  version: number;
  correction_reason: string;
}
