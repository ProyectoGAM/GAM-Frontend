import { Injectable, inject } from '@angular/core';
import { concatMap, map, of, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { ProductionUnit, ProductionUnitPage } from '../interfaces/production-unit.interface';

@Injectable({ providedIn: 'root' })
export class ProductionUnitsService {
  private readonly api = inject(ApiClient);

  listAll() {
    return this.api.get<ProductionUnitPage>('production-units', {
      params: { page: 1, per_page: 100 },
    }).pipe(
      concatMap((firstPage) => {
        if (firstPage.meta.last_page <= 1) return of(firstPage.data);

        const remainingPages = Array.from(
          { length: firstPage.meta.last_page - 1 },
          (_, index) => index + 2,
        );

        return of(...remainingPages).pipe(
          concatMap((page) => this.api.get<ProductionUnitPage>('production-units', {
            params: { page, per_page: 100 },
          })),
          map((response) => response.data),
          toArray(),
          map((pages) => [firstPage.data, ...pages].flat()),
        );
      }),
      map((units): ProductionUnit[] => units),
    );
  }
}
