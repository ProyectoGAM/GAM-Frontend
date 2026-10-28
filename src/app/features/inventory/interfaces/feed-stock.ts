import { FeedStockStatus } from '../types/feed-stock-status.type';

export interface FeedStockBalance {
  receta_id: number;
  nombre_receta: string;
  estado_receta: 'active' | 'inactive';
  up_id: number;
  nombre_up: string;
  saldo_g: string;
  minimo_g: string | null;
  estado_stock: FeedStockStatus;
  requiere_atencion: boolean;
}

export interface FeedStockFilters {
  up_id: number;
  receta_id?: number;
  requiere_atencion?: boolean;
  page?: number;
}

export interface FeedStockRecipe {
  id: number;
  nombre: string;
  estado: 'active' | 'inactive';
}
