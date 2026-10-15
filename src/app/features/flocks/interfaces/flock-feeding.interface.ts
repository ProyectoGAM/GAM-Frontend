import { FeedingMode } from '../types/feeding-state.type';

export interface FeedingStage {
  recipe_id: number;
  recipe_snapshot: Record<string, unknown>;
}

export interface ScheduledFeedingStage extends FeedingStage {
  start_day: number;
}

export interface FlockFeeding {
  id: number;
  lote_id: string;
  modo: FeedingMode;
  receta_id: number;
  cantidad_diaria_g: string;
  cantidad_manual_g: string | null;
  edad_dias: number;
  fecha_vigencia: string;
  etapa: FeedingStage;
  finalizado: boolean;
}

export interface FeedingChange {
  id: number;
  modo: FeedingMode;
  created_by: number | null;
  etapas_copiadas: ScheduledFeedingStage[];
}

export interface FlockFeedingOverview {
  current: FlockFeeding;
  recipeName: string;
  scheduleAvailable: boolean;
  nextChange: { date: string; day: number } | null;
}

export interface FeedConsumption {
  id: number;
  fecha: string;
  up_id: number;
  modo: FeedingMode;
  receta_id: number;
  cantidad_g: string;
  original: { receta_id: number; cantidad_g: string };
  etapa: FeedingStage;
}

export interface FeedingPage<T> {
  data: T[];
  meta: { current_page: number; last_page: number };
}

export interface FeedBalance {
  receta_id: number;
  nombre_receta: string;
  estado_receta: 'active' | 'inactive';
  up_id: number;
  nombre_up: string;
  saldo_g: string;
}

export interface FeedingRecipeOption {
  id: number;
  name: string;
  inactive: boolean;
  balance: string | null;
}

export interface ManualFeedingInput {
  receta_id?: number;
  cantidad_diaria_g?: string;
}

export interface FeedCorrectionInput {
  receta_id?: number;
  cantidad_g?: string;
  motivo: string;
}

export interface FeedingSubmission {
  mode?: FeedingMode;
  recipeId: number | null;
  grams: string | null;
  reason: string;
}

export interface FeedRecipeSummary {
  recipeId: number;
  name: string;
  grams: string;
  quantityText: string;
}

export interface DailyFeedPoint {
  date: string;
  grams: string;
  quantityText: string;
}
