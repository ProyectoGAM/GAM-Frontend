import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { CreatePlanTemplateRequest, ExpectedPlanTemplateVersionRequest, FlockPlan, FlockSummary, PlanCatalogOption, PlanCatalogType, PlanEnvelope, PlanPage, PlanTemplate, RevisePlanTemplateRequest } from '../interfaces/management-plan';

@Injectable({ providedIn: 'root' })
export class ManagementPlansService {
  private readonly api = inject(ApiClient);

  templates(page = 1, status?: 'active' | 'retired'): Observable<PlanPage<PlanTemplate>> {
    return this.api.get<PlanPage<PlanTemplate>>('plantillas-manejo', { params: { page, per_page: 10, status } });
  }

  template(id: string, version?: number): Observable<PlanEnvelope<PlanTemplate>> {
    return this.api.get<PlanEnvelope<PlanTemplate>>(`plantillas-manejo/${encodeURIComponent(id)}`, { params: { version } });
  }

  createTemplate(request: CreatePlanTemplateRequest, idempotencyKey: string): Observable<PlanEnvelope<PlanTemplate>> {
    return this.api.post<PlanEnvelope<PlanTemplate>, CreatePlanTemplateRequest>('plantillas-manejo', request, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  reviseTemplate(id: string, request: RevisePlanTemplateRequest, idempotencyKey: string): Observable<PlanEnvelope<PlanTemplate>> {
    return this.api.patch<PlanEnvelope<PlanTemplate>, RevisePlanTemplateRequest>(`plantillas-manejo/${encodeURIComponent(id)}`, request, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  publishTemplate(id: string, expectedVersion: number, idempotencyKey: string): Observable<PlanEnvelope<PlanTemplate>> {
    return this.api.post<PlanEnvelope<PlanTemplate>, ExpectedPlanTemplateVersionRequest>(`plantillas-manejo/${encodeURIComponent(id)}/publicacion`, {
      expected_version: expectedVersion,
    }, { headers: { 'Idempotency-Key': idempotencyKey } });
  }

  retireTemplate(id: string, expectedVersion: number, idempotencyKey: string): Observable<PlanEnvelope<PlanTemplate>> {
    return this.api.post<PlanEnvelope<PlanTemplate>, ExpectedPlanTemplateVersionRequest>(`plantillas-manejo/${encodeURIComponent(id)}/retiro`, {
      expected_version: expectedVersion,
    }, { headers: { 'Idempotency-Key': idempotencyKey } });
  }

  async catalogOptions(type: PlanCatalogType): Promise<PlanCatalogOption[]> {
    const options: PlanCatalogOption[] = [];
    let page = 1;
    let lastPage = 1;
    do {
      if (type === 'ration_change') {
        const result = await firstValueFrom(this.api.get<PlanPage<{ id: number; name: string }>>('products', {
          params: { kind: 'finished_feed', status: 'active', page, per_page: 100 },
        }));
        options.push(...result.data.map((item) => ({ value: String(item.id), label: item.name })));
        lastPage = result.meta.last_page;
      } else if (type === 'vaccination') {
        const result = await firstValueFrom(this.api.get<PlanPage<{ id: string; nombre: string }>>('vacunas', {
          params: { estado: 'active', page, per_page: 100 },
        }));
        options.push(...result.data.map((item) => ({ value: item.id, label: item.nombre })));
        lastPage = result.meta.last_page;
      } else {
        const result = await firstValueFrom(this.api.get<PlanPage<{ id: string; name: string }>>('medicines', {
          params: { page, per_page: 100 },
        }));
        options.push(...result.data.map((item) => ({ value: item.id, label: item.name })));
        lastPage = result.meta.last_page;
      }
      page++;
    } while (page <= lastPage);
    return options.sort((left, right) => left.label.localeCompare(right.label, 'es'));
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
