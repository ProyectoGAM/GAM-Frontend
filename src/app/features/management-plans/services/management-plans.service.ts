import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { FlockPlan, FlockSummary, PlanEnvelope, PlanPage, PlanTemplate } from '../interfaces/management-plan';

@Injectable({ providedIn: 'root' })
export class ManagementPlansService {
  private readonly api = inject(ApiClient);

  templates(page = 1, status?: 'active' | 'retired'): Observable<PlanPage<PlanTemplate>> {
    return this.api.get<PlanPage<PlanTemplate>>('plantillas-manejo', { params: { page, per_page: 10, status } });
  }

  template(id: string, version?: number): Observable<PlanEnvelope<PlanTemplate>> {
    return this.api.get<PlanEnvelope<PlanTemplate>>(`plantillas-manejo/${encodeURIComponent(id)}`, { params: { version } });
  }

  flocks(page = 1, search?: string): Observable<PlanPage<FlockSummary>> {
    return this.api.get<PlanPage<FlockSummary>>('flocks', { params: { page, per_page: 10, search: search || undefined } });
  }

  flock(id: string): Observable<PlanEnvelope<FlockSummary>> {
    return this.api.get<PlanEnvelope<FlockSummary>>(`flocks/${encodeURIComponent(id)}`);
  }

  flockPlan(id: string, includeRevisions = false): Observable<PlanEnvelope<FlockPlan>> {
    return this.api.get<PlanEnvelope<FlockPlan>>(`flocks/${encodeURIComponent(id)}/plan-manejo`, {
      params: { include_revisions: includeRevisions ? 1 : undefined },
    });
  }
}
