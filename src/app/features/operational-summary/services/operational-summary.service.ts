import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { EggPresentationsApi } from '../../inventory/services/egg-presentations.api';
import { ReportingService } from '../../reporting/services/reporting.service';
import {
  DeliveredValue, EggMetrics, ExpenseSummary, FeedBalance, LiveBirds,
  MortalityMetrics, OperationalAlertSummary, SummaryFlock,
  SummaryList, SummaryPeriod,
} from '../interfaces/operational-summary';

type SummaryParams = Record<string, string | number | null | undefined>;

@Injectable({ providedIn: 'root' })
export class OperationalSummaryService {
  private readonly api = inject(ApiClient);
  private readonly reporting = inject(ReportingService);
  private readonly eggCatalog = inject(EggPresentationsApi);

  eggs(period: SummaryPeriod, unit: number | null) {
    return this.data<EggMetrics>('collections/metrics', { ...dates(period), production_unit_id: unit, comparar_anterior: 1 });
  }

  eggPresentations() {
    return this.eggCatalog.list().pipe(map(({ data }) => data.filter(({ eggs_per_unit }) =>
      Number.isSafeInteger(eggs_per_unit) && eggs_per_unit > 0)));
  }

  liveBirds(unit: number | null) {
    return this.data<LiveBirds>('lotes/resumen', { up_id: unit });
  }

  mortality(period: SummaryPeriod, unit: number | null) {
    return this.data<MortalityMetrics>('mortalidades/resumen', { desde: period.from, hasta: period.to, up_id: unit });
  }

  alerts(unit: number | null) {
    return this.data<OperationalAlertSummary>('alertas-operativas/resumen', { up_id: unit });
  }

  expenses(period: SummaryPeriod, unit: number | null) {
    return this.data<ExpenseSummary>('gastos/resumen', { desde: period.from, hasta: period.to, up_id: unit });
  }

  deliveredValue(period: SummaryPeriod) {
    return this.reporting.preview('deliveries.deliveries', {
      from: period.from,
      to: period.to,
      metrics: ['merchandise_total', 'delivery_count', 'unpriced_delivery_count'],
    }).pipe(map(({ data }): DeliveredValue => {
      const row = data.rows[0];
      const deliveries = Number(row?.['delivery_count'] ?? 0);
      const unpriced = Number(row?.['unpriced_delivery_count'] ?? 0);
      return {
        amount: deliveries === 0 ? '0' : row?.['merchandise_total'] == null ? null : String(row['merchandise_total']),
        deliveries,
        unpriced,
      };
    }));
  }

  flocks(unit: number | null, page: number) {
    return this.api.get<SummaryList<SummaryFlock>>('flocks', { params: { production_unit_id: unit, page, per_page: 10 } });
  }

  feedBalances(unit: number, page: number) {
    return this.api.get<SummaryList<FeedBalance>>('saldos-alimento', { params: { up_id: unit, page, por_pagina: 10 } });
  }

  private data<T>(path: string, params: SummaryParams) {
    return this.api.get<{ data: T }>(path, { params }).pipe(map((response) => response.data));
  }
}

function dates(period: SummaryPeriod) {
  return { date_from: period.from, date_to: period.to };
}
