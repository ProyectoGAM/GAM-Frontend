import { Injectable, inject } from '@angular/core';
import { concatMap, from, map, Observable, of, toArray } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  CreateFlockRequest,
  CreateFlockResponse,
  Flock,
  FlockCatalogOption,
  FlockListFilters,
  FlockPlanTemplateOption,
  FlockSupplierOption,
} from '../interfaces/flock.interface';

interface PaginatedItems<T> {
  data: T[];
  meta: { last_page: number };
}

@Injectable({ providedIn: 'root' })
export class FlocksApi {
  private readonly api = inject(ApiClient);

  list(filters: FlockListFilters = {}): Observable<Flock[]> {
    return this.allPages<Flock>('flocks', {
      ...(filters.production_unit_id === undefined ? {} : { production_unit_id: filters.production_unit_id }),
      ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
    });
  }

  activeBreeds(): Observable<FlockCatalogOption[]> {
    return this.allPages<FlockCatalogOption>('breeds', { status: 'active' });
  }

  activeSuppliers(): Observable<FlockSupplierOption[]> {
    return this.allPages<FlockSupplierOption>('suppliers', { status: 'active' });
  }

  publishedTemplates(): Observable<FlockPlanTemplateOption[]> {
    return this.allPages<FlockPlanTemplateOption>('plantillas-manejo', { status: 'active' }).pipe(
      map((templates) => templates.filter((template) => template.status === 'active'
        && template.published_version !== null)),
    );
  }

  create(request: CreateFlockRequest, idempotencyKey: string): Observable<CreateFlockResponse> {
    return this.api.post<CreateFlockResponse, CreateFlockRequest>('flocks', request, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  private allPages<T>(path: string, filters: Record<string, string | number>): Observable<T[]> {
    return this.page<T>(path, filters, 1).pipe(
      concatMap((firstPage) => {
        if (firstPage.meta.last_page <= 1) return of(firstPage.data);

        const remainingPages = Array.from(
          { length: firstPage.meta.last_page - 1 },
          (_, index) => index + 2,
        );

        return from(remainingPages).pipe(
          concatMap((page) => this.page<T>(path, filters, page)),
          map((response) => response.data),
          toArray(),
          map((pages) => [firstPage.data, ...pages].flat()),
        );
      }),
    );
  }

  private page<T>(path: string, filters: Record<string, string | number>, page: number): Observable<PaginatedItems<T>> {
    return this.api.get<PaginatedItems<T>>(path, {
      params: { ...filters, page, per_page: 100 },
    });
  }
}
