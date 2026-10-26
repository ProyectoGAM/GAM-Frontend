import { Injectable, inject } from '@angular/core';
import { concatMap, from, map, of, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { ApiEnvelope, PaginatedResponse } from '../interfaces/inventory';
import { FeedStockBalance, FeedStockFilters, FeedStockRecipe } from '../interfaces/feed-stock';

@Injectable({ providedIn: 'root' })
export class FeedStockApi {
  private readonly api = inject(ApiClient);

  balances(filters: FeedStockFilters) {
    return this.api.get<PaginatedResponse<FeedStockBalance>>('saldos-alimento', {
      params: { ...filters, por_pagina: 25,
        requiere_atencion: filters.requiere_atencion === undefined ? undefined : filters.requiere_atencion ? 1 : 0 },
    });
  }

  balance(unit: number, recipe: number) {
    return this.api.get<ApiEnvelope<FeedStockBalance>>(`unidades-productivas/${unit}/recetas/${recipe}/saldo`);
  }

  setMinimum(unit: number, recipe: number, grams: string | null) {
    return this.api.patch<ApiEnvelope<FeedStockBalance>>(`unidades-productivas/${unit}/recetas/${recipe}/minimo`, { minimo_g: grams });
  }

  recipes() {
    const page = (number: number) => this.api.get<PaginatedResponse<FeedStockRecipe>>('recetas', {
      params: { por_pagina: 100, page: number },
    });
    return page(1).pipe(concatMap((first) => {
      if (first.meta.last_page <= 1) return of(first.data);
      return from(Array.from({ length: first.meta.last_page - 1 }, (_, index) => index + 2)).pipe(
        concatMap(page), map((response) => response.data), toArray(),
        map((remaining) => [first.data, ...remaining].flat()),
      );
    }));
  }
}
