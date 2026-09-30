import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { ProductionUnit } from '../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';

type UnitLoadState = 'loading' | 'ready' | 'error';

@Injectable()
export class AdminUnitContextService {
  private readonly auth = inject(AuthStore);
  private readonly unitsApi = inject(ProductionUnitsService);
  readonly units = signal<readonly ProductionUnit[]>([]);
  readonly state = signal<UnitLoadState>('loading');
  readonly selectedId = signal<number | null>(null);
  readonly selectedUnit = computed(() => this.units().find((unit) => unit.id === this.selectedId()) ?? null);
  private loadVersion = 0;

  async load(): Promise<void> {
    const version = ++this.loadVersion;
    this.state.set('loading');
    try {
      const units = await firstValueFrom(this.unitsApi.listAll());
      if (version !== this.loadVersion) return;
      this.units.set(units);
      if (!this.auth.isAdmin() && !units.some((unit) => unit.id === this.selectedId())) {
        this.selectedId.set(units.find((unit) => unit.status === 'active')?.id ?? units[0]?.id ?? null);
      } else if (this.selectedId() !== null && !units.some((unit) => unit.id === this.selectedId())) {
        this.selectedId.set(null);
      }
      this.state.set('ready');
    } catch {
      if (version === this.loadVersion) this.state.set('error');
    }
  }

  select(id: number | null): void {
    if (id === null && this.auth.isAdmin()) {
      this.selectedId.set(null);
    } else if (id !== null && this.units().some((unit) => unit.id === id)) {
      this.selectedId.set(id);
    }
  }

  reset(): void {
    this.loadVersion += 1;
    this.units.set([]);
    this.selectedId.set(null);
    this.state.set('loading');
  }
}
