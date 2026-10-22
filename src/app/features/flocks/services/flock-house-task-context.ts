import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';

import { FlockHouseOrigin } from '../interfaces/flock-detail.interface';
import { Flock } from '../interfaces/flock.interface';

export function parseFlockHouseOrigin(params: ParamMap | undefined): FlockHouseOrigin | null {
  const unit = params?.get('unitId') ?? '';
  const house = params?.get('houseId') ?? '';
  return params?.get('lotFrom') === 'house' && /^[1-9]\d*$/.test(unit) && /^[1-9]\d*$/.test(house)
    && Number.isSafeInteger(Number(unit)) && Number.isSafeInteger(Number(house))
    ? { unitId: Number(unit), houseId: Number(house) } : null;
}

/** Page-scoped navigation context, never evidence of authorization. */
@Injectable()
export class FlockHouseTaskContext {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.queryParamMap);
  readonly origin = computed(() => parseFlockHouseOrigin(this.params()));
  readonly isTask = computed(() => !!this.origin() && this.params()?.get('task') === 'entry');
  readonly backLink = computed(() => {
    const origin = this.origin();
    return origin ? `/administracion/unidades-productivas/${origin.unitId}/galpon/${origin.houseId}`
      : null;
  });
  readonly backLabel = computed(() => this.origin() ? 'Volver al galpón' : 'Volver al lote');

  matches(flock: Pick<Flock, 'poultry_house_id' | 'production_unit_id'> | null): boolean {
    const origin = this.origin();
    return !origin || !flock || (flock.poultry_house_id === origin.houseId && flock.production_unit_id === origin.unitId);
  }

  returnToHouse(message?: string): void {
    const link = this.backLink();
    if (link) void this.router.navigateByUrl(link, { state: { flockTaskMessage: message ?? null } });
  }
}
