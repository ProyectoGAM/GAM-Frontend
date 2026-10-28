import { RecipeStatus } from '../types/recipe-status.type';

export interface RecipeIngredient {
  producto_id: number;
  nombre: string;
  sku: string;
  cantidad_g: string;
}

export interface FeedRecipe {
  id: number;
  nombre: string;
  nota: string | null;
  rendimiento_g: string;
  estado: RecipeStatus;
  ingredientes: RecipeIngredient[];
  creado_en: string;
  actualizado_en: string;
}

export interface RecipeFilters {
  buscar: string;
  estado: RecipeStatus | '';
  page: number;
}

export interface RecipePage {
  data: FeedRecipe[];
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta: { current_page: number; last_page: number; per_page: number; total: number };
}
