import { FeedAdjustmentAction } from '../types/feed-adjustment-action.type';

export interface FeedAdjustmentIngredient {
  id: number;
  name: string;
  sku: string;
  stockGrams: string;
}

export interface FeedAdjustmentRequest {
  accion: FeedAdjustmentAction;
  valor_g: string;
  motivo: string;
}

export interface FeedAdjustmentResult {
  id: number;
  producto_id: number;
  planta_id: number;
  saldo_anterior_g: string;
  saldo_resultante_g: string;
}

export interface PendingFeedAdjustment {
  key: string;
  productId: number;
  request: FeedAdjustmentRequest;
}
