import { HttpErrorResponse } from '@angular/common/http';
import { ParamMap } from '@angular/router';
import { RecipeFilters, RecipeIngredient } from '../interfaces/feed-recipe';

export function recipeKilograms(grams: string): string {
  const value = BigInt(grams);
  const fraction = String(value % 1000n).padStart(3, '0').replace(/0+$/, '');
  const integer = String(value / 1000n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${integer}${fraction ? ',' + fraction : ''} kg`;
}

export function ingredientPreview(ingredients: readonly RecipeIngredient[]): string {
  const names = ingredients.slice(0, 4).map((item) => item.nombre).join(', ');
  return names + (ingredients.length > 4 ? ` y ${ingredients.length - 4} más` : '');
}

export function recipeFilters(params: ParamMap): RecipeFilters {
  const page = params.get('page') ?? '1';
  const status = params.get('estado');
  return {
    buscar: (params.get('buscar') ?? '').trim().slice(0, 120),
    estado: status === 'active' || status === 'inactive' ? status : '',
    page: /^\d+$/.test(page) && Number(page) >= 1 && Number(page) <= 1000000 ? Number(page) : 1,
  };
}

export function recipeQuery(filters: RecipeFilters): Record<string, string | number | null> {
  return { buscar: filters.buscar || null, estado: filters.estado || null, page: filters.page > 1 ? filters.page : null };
}

export function recipeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'No se pudo conectar con el servidor. Intenta nuevamente.';
  if (error.status === 401) return 'La sesión expiró. Vuelve a iniciar sesión.';
  if (error.status === 403) return 'No tienes permiso para consultar recetas.';
  if (error.status === 404) return 'No se encontró la receta solicitada.';
  return fallback;
}
