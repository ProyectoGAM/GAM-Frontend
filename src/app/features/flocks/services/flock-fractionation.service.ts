import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, switchMap } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { FractionationContext, FractionationRequest, FractionationResult } from '../interfaces/flock-fractionation.interface';
import { FlockDetailService } from './flock-detail.service';
import { FlocksApi } from './flocks.api';

@Injectable({ providedIn: 'root' })
export class FlockFractionationService {
  private readonly api = inject(ApiClient);
  private readonly detail = inject(FlockDetailService);
  private readonly flocks = inject(FlocksApi);
  private readonly units = inject(ProductionUnitsService);

  load(id: string): Observable<FractionationContext> {
    return this.detail.flock(id).pipe(switchMap((source) => forkJoin({
      houses: this.units.poultryHouses(source.production_unit_id, 'poultry'),
      flocks: this.flocks.list({ production_unit_id: source.production_unit_id }),
      unit: this.units.getById(source.production_unit_id),
    }).pipe(map(({ houses, flocks, unit }) => ({ source, houses, flocks, unitName: unit.data.name })))));
  }

  submit(id: string, body: FractionationRequest, key: string): Observable<FractionationResult> {
    return this.api.post<{ data: FractionationResult }, FractionationRequest>(
      `flocks/${encodeURIComponent(id)}/redistributions`, body, { headers: { 'Idempotency-Key': key } },
    ).pipe(map((response) => response.data));
  }
}
