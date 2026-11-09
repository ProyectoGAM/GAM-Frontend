import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../../core/api/api-client';
import { BreedCatalogPage, BreedCatalogQuery, CreateBreed, UpdateBreed } from '../interfaces/breed-catalog';

@Injectable({ providedIn: 'root' })
export class BreedCatalogService {
  private readonly api = inject(ApiClient);

  list({ search, status, page }: BreedCatalogQuery) {
    return this.api.get<BreedCatalogPage>('breeds', {
      params: { search: search || undefined, status: status || undefined, page, per_page: 20 },
    });
  }

  create(payload: CreateBreed, key: string) {
    return this.api.post<unknown, CreateBreed>('breeds', payload, { headers: { 'Idempotency-Key': key } });
  }

  update(id: number, payload: UpdateBreed, key: string) {
    return this.api.patch<unknown, UpdateBreed>(`breeds/${id}`, payload, { headers: { 'Idempotency-Key': key } });
  }
}
