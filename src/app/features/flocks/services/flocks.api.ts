import { Injectable, inject } from '@angular/core';
import { concatMap, from, map, Observable, of, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { Flock, FlockListFilters, PaginatedFlocks } from '../interfaces/flock.interface';

@Injectable({ providedIn: 'root' })
export class FlocksApi {
  private readonly api = inject(ApiClient);

  list(filters: FlockListFilters = {}): Observable<Flock[]> {
    return this.page(filters, 1).pipe(
      concatMap((firstPage) => {
        if (firstPage.meta.last_page <= 1) return of(firstPage.data);

        const remainingPages = Array.from(
          { length: firstPage.meta.last_page - 1 },
          (_, index) => index + 2,
        );

        return from(remainingPages).pipe(
          concatMap((page) => this.page(filters, page)),
          map((response) => response.data),
          toArray(),
          map((pages) => [firstPage.data, ...pages].flat()),
        );
      }),
    );
  }

  private page(filters: FlockListFilters, page: number): Observable<PaginatedFlocks> {
    return this.api.get<PaginatedFlocks>('flocks', {
      params: {
        ...(filters.production_unit_id === undefined ? {} : { production_unit_id: filters.production_unit_id }),
        ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
        page,
        per_page: 100,
      },
    });
  }
}
