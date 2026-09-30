import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { ApiEnvelope, PaginatedResponse, Product, ReferenceOptions } from '../interfaces/inventory';

@Injectable({ providedIn: 'root' })
export class InventoryReferenceApi {
  private readonly api = inject(ApiClient);

  options(): Observable<ApiEnvelope<ReferenceOptions>> {
    return this.api.get<ApiEnvelope<ReferenceOptions>>('reference/options');
  }

  activeProducts(search = ''): Observable<PaginatedResponse<Product>> {
    return this.api.get<PaginatedResponse<Product>>('products', {
      params: { status: 'active', search: search || undefined, per_page: 100 },
    });
  }
}
