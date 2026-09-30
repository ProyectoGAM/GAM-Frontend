import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import {
  StoreSupplierRequest,
  StoreSupplierResponse,
  SupplierListFilters,
  SupplierListResponse,
  SupplierStatus,
  UpdateSupplierRequest,
} from './suppliers.models';

@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly api = inject(ApiClient);

  list(filters: SupplierListFilters = {}, page = 1): Observable<SupplierListResponse> {
    return this.api.get<SupplierListResponse>('suppliers', {
      params: {
        ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.per_page !== undefined ? { per_page: filters.per_page } : {}),
        page,
      },
    });
  }

  create(request: StoreSupplierRequest): Observable<StoreSupplierResponse> {
    return this.api.post<StoreSupplierResponse, StoreSupplierRequest>('suppliers', request);
  }

  updateSupplier(id: number, request: UpdateSupplierRequest): Observable<StoreSupplierResponse> {
    return this.api.patch<StoreSupplierResponse, UpdateSupplierRequest>(`suppliers/${id}`, request);
  }

  changeSupplierStatus(id: number, status: SupplierStatus): Observable<StoreSupplierResponse> {
    return this.api.patch<StoreSupplierResponse, { status: SupplierStatus }>(`suppliers/${id}/status`, { status });
  }
}
