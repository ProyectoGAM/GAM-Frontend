import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { AuditActorPage, AuditDetail, AuditFilters, AuditOptions, AuditPage } from '../interfaces/audit';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly api = inject(ApiClient);
  responsibles(search = '', page = 1): Observable<AuditActorPage> {
    return this.api.get<AuditActorPage>('auditoria/responsables', { params: { buscar: search || undefined, por_pagina: 25, page } });
  }

  detail(id: number): Observable<{ data: AuditDetail }> {
    return this.api.get<{ data: AuditDetail }>(`auditoria/entradas/${id}`);
  }

  entries(filters: AuditFilters): Observable<AuditPage> {
    return this.api.get<AuditPage>('audit/entries', { params: { ...filters } });
  }

  options(): Observable<{ data: AuditOptions }> {
    return this.api.get<{ data: AuditOptions }>('reference/options');
  }
}
