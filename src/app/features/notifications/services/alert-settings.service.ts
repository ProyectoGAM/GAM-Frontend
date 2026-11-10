import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { AlertSettingsResult, AlertThresholds, FeedCoverageThresholds } from '../interfaces/alert-settings';
import { AlertRuleId } from '../types/alert-settings.type';
import { OperationalAlert } from '../interfaces/operational-alert';
import { OperationalAlertModule, OperationalAlertValues } from '../types/operational-alert.type';

interface ApiResult<T> { data: T }

@Injectable({ providedIn: 'root' })
export class AlertSettingsService {
  private readonly api = inject(ApiClient);

  listOperational(unitId: number | null, module: OperationalAlertModule) {
    return this.api.get<ApiResult<OperationalAlert[]>>(this.operationalPath(unitId)).pipe(
      map(({ data }) => data.filter((item) => item.modulo === module && item.unidad_productiva_id === unitId)),
    );
  }

  saveOperational(unitId: number | null, type: string, changes: OperationalAlertValues) {
    return this.api.patch<ApiResult<OperationalAlert>, OperationalAlertValues>(
      `${this.operationalPath(unitId)}/${encodeURIComponent(type)}`, changes,
    ).pipe(map(({ data }) => data));
  }

  private operationalPath(unitId: number | null): string {
    return unitId === null ? 'configuracion-alertas' : `unidades-productivas/${unitId}/configuracion-alertas`;
  }

  load(unitId: number, ids: readonly AlertRuleId[]) {
    return forkJoin(ids.map((id) => this.loadRule(unitId, id).pipe(map((result) => [id, result] as const)))).pipe(
      map((entries): ReadonlyMap<AlertRuleId, AlertSettingsResult> => new Map(entries)),
    );
  }

  private loadRule(unitId: number, id: AlertRuleId): Observable<AlertSettingsResult> {
    const path = this.path(unitId, id);
    const request = id === 'feed_coverage'
      ? this.api.get<ApiResult<FeedCoverageThresholds>>(path).pipe(map(({ data }) => this.coverageThresholds(data)))
      : this.api.get<ApiResult<AlertThresholds>>(path).pipe(map(({ data }) => data));

    return request.pipe(
      map((thresholds) => ({ thresholds, error: '' })),
      catchError((error: unknown) => of({ thresholds: null, error: alertSettingsError(error, 'No se pudo consultar esta alerta.') })),
    );
  }

  save(unitId: number, id: AlertRuleId, thresholds: AlertThresholds): Observable<AlertThresholds> {
    const path = this.path(unitId, id);
    if (id === 'feed_coverage') {
      if (thresholds.medio === null) return throwError(() => new Error('Feed coverage requires a medium threshold.'));
      return this.api.put<ApiResult<FeedCoverageThresholds>, FeedCoverageThresholds>(path, {
        dias_aviso_bajo: thresholds.bajo,
        dias_aviso: thresholds.medio,
        dias_urgencia: thresholds.alto,
      }).pipe(map(({ data }) => this.coverageThresholds(data)));
    }
    return this.api.put<ApiResult<AlertThresholds>, AlertThresholds>(path, thresholds).pipe(map(({ data }) => data));
  }

  private path(unitId: number, id: AlertRuleId): string {
    const scope = `unidades-productivas/${unitId}`;
    return id === 'feed_coverage' ? `${scope}/alertas-cobertura-racion` : `${scope}/umbrales-alertas/${id}`;
  }

  private coverageThresholds(data: FeedCoverageThresholds): AlertThresholds {
    return { bajo: data.dias_aviso_bajo, medio: data.dias_aviso, alto: data.dias_urgencia };
  }
}

export function alertSettingsError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'No se pudo conectar. Revisá tu conexión y volvé a intentar.';
  if (error.status === 401 || error.status === 403) return 'Tu cuenta no tiene acceso a esta configuración.';
  if (error.status === 404) return 'Esta alerta o unidad productiva ya no está disponible.';
  if (error.status === 422) return 'El servidor rechazó los umbrales. Revisá los valores ingresados.';
  return fallback;
}
