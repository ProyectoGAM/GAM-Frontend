import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { FeedRecipe, RecipeFilters, RecipePage } from '../interfaces/feed-recipe';
import { CreateFeedRecipe, RecipeMaterial, RecipeMaterialsPage } from '../interfaces/create-feed-recipe';
import { EMPTY, expand, map, reduce } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FeedRecipesApi {
  private readonly api = inject(ApiClient);

  list(filters: RecipeFilters) {
    return this.api.get<RecipePage>('recetas', {
      params: { buscar: filters.buscar || undefined, estado: filters.estado || undefined, page: filters.page, por_pagina: 25 },
    });
  }

  get(id: string) { return this.api.get<{ data: FeedRecipe }>(`recetas/${encodeURIComponent(id)}`); }

  create(body: CreateFeedRecipe, key: string) {
    return this.api.post<{ data: FeedRecipe }, CreateFeedRecipe>('recetas', body, { headers: { 'Idempotency-Key': key } });
  }

  materials() {
    const page = (number: number) => this.api.get<RecipeMaterialsPage>('products', {
      params: { kind: 'raw_material', per_page: 100, page: number },
    });
    return page(1).pipe(
      expand((result) => result.meta.current_page < result.meta.last_page ? page(result.meta.current_page + 1) : EMPTY),
      reduce((all, result) => [...all, ...result.data], [] as RecipeMaterial[]),
      map((all) => all.filter((item) => item.kind === 'raw_material' && item.base_unit === 'g' && item.stock_tracked)
        .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id - b.id)),
    );
  }
}
