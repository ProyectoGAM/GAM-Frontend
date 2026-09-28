import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { PaginatedProducts, Product, ProductInput, ProductStatus } from './products.models';

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly api = inject(ApiClient);

  list(page = 1): Observable<PaginatedProducts> {
    return this.api.get<PaginatedProducts>('products', { params: { page } });
  }

  get(id: number | string): Observable<{ data: Product }> {
    return this.api.get<{ data: Product }>(`products/${encodeURIComponent(String(id))}`);
  }

  create(body: ProductInput): Observable<{ data: Product }> {
    return this.api.post<{ data: Product }, ProductInput>('products', body);
  }

  update(id: number | string, body: Partial<ProductInput>): Observable<{ data: Product }> {
    return this.api.patch<{ data: Product }, Partial<ProductInput>>(`products/${encodeURIComponent(String(id))}`, body);
  }

  setStatus(id: number | string, status: ProductStatus): Observable<{ data: Product }> {
    return this.api.patch<{ data: Product }, { status: ProductStatus }>(`products/${encodeURIComponent(String(id))}/status`, { status });
  }
}
