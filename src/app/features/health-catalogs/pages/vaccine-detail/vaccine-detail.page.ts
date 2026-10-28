import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { CatalogRecord } from '../../interfaces/health-catalog';
import { HealthLoadState } from '../../types/health-catalog.type';
import { HealthCatalogsApi } from '../../services/health-catalogs.api';
import { catalogFilters, catalogQuery, healthError, unitLabel } from '../../services/health-catalog-presentation';
@Component({
  selector: 'app-vaccine-detail', imports: [DatePipe, RouterLink],
  templateUrl: './vaccine-detail.page.html', styleUrl: './vaccine-detail.page.scss',
})
export class VaccineDetailPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(HealthCatalogsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly id = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly allowed = computed(() => this.auth.isAdmin());
  readonly record = signal<CatalogRecord | null>(null);
  readonly unit = computed(() => this.record()?.vaccine ? unitLabel(this.record()!.vaccine!.unit) : '');
  readonly state = signal<HealthLoadState>('idle');
  readonly error = signal<string | null>(null);
  readonly returnQuery = catalogQuery(catalogFilters(this.route.snapshot.queryParamMap, 'vaccines'));
  private version = 0;
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.id.set(params.get('id') ?? ''));
    effect(() => {
      const actor = this.auth.user()?.id;
      const allowed = this.allowed();
      const id = this.id();
      untracked(() => {
        this.version++; this.record.set(null); this.error.set(null);
        if (actor && allowed) void this.load(id);
        else this.state.set('forbidden');
      });
    });
  }
  async load(id = this.id()): Promise<void> {
    if (!this.allowed()) return;
    const version = ++this.version;
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) { this.state.set('error'); this.error.set('No se encontró la vacuna solicitada.'); return; }
    this.state.set('loading'); this.error.set(null);
    try {
      const item = await firstValueFrom(this.api.vaccine(id));
      if (version !== this.version || this.destroyRef.destroyed) return;
      this.record.set(item); this.state.set('success');
    } catch (error) {
      if (version !== this.version || this.destroyRef.destroyed) return;
      this.error.set(healthError(error, 'No se pudo cargar la vacuna.')); this.state.set('error');
    }
  }
}
