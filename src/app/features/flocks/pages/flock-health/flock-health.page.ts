import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, medicalOutline, addOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { isAdminUser } from '../../../../core/auth/access-policy';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { HealthApplicationComponent } from '../../components/health-application/health-application.component';
import { HealthApplicationDraft, HealthHistoryRow } from '../../interfaces/flock-health.interface';
import { FlockHealthApplicationService } from '../../services/flock-health-application.service';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockHealthService } from '../../services/flock-health.service';
import { HealthLoadState } from '../../types/flock-health.type';

@Component({
  selector: 'app-flock-health-page',
  providers: [FlockHealthApplicationService],
  imports: [RouterLink, IonIcon, IonSpinner, HealthApplicationComponent],
  templateUrl: './flock-health.page.html',
  styleUrl: './flock-health.page.scss',
})
export class FlockHealthPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthStore);
  private readonly detail = inject(FlockDetailService);
  private readonly health = inject(FlockHealthService);
  private readonly application = inject(FlockHealthApplicationService);
  private readonly units = inject(AdminUnitContextService);
  private readonly productionUnits = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = toSignal(this.route.paramMap);
  private readonly query = toSignal(this.route.queryParamMap);
  readonly editor = viewChild<HealthApplicationComponent>('editor');
  private version = 0;
  private historyVersion = 0;
  readonly flockId = this.application.flockId;
  readonly flock = this.application.flock;
  readonly state = signal<HealthLoadState>('loading');
  readonly historyState = signal<HealthLoadState>('loading');
  readonly rows = signal<HealthHistoryRow[]>([]);
  readonly visibleCount = signal(20);
  readonly visibleRows = computed(() => this.rows().slice(0, this.visibleCount()));
  readonly houseName = signal<string | null>(null);
  readonly unitName = computed(() => this.units.units().find((unit) => unit.id === this.flock()?.production_unit_id)?.name ?? null);
  readonly plan = this.application.plan;
  readonly vaccines = this.application.vaccines;
  readonly medicines = this.application.medicines;
  readonly dataReady = this.application.dataReady;
  readonly dataError = this.application.dataError;
  readonly saving = this.application.saving;
  readonly uncertain = this.application.uncertain;
  readonly actionError = this.application.actionError;
  readonly success = this.application.success;
  readonly canView = computed(() => isAdminUser(this.auth.user()) || this.auth.user()?.permissions?.includes('management-plans.view') === true);
  readonly canExecute = this.application.canExecute;
  readonly canApply = this.application.canApply;
  readonly backLink = computed(() => ['/administracion/lotes/lotes', this.flockId()]);
  readonly backQuery = computed(() => this.query()?.get('lotFrom') === 'house'
    ? { lotFrom: 'house', unitId: this.query()?.get('unitId'), houseId: this.query()?.get('houseId') } : null);

  constructor() {
    addIcons({ arrowBackOutline, medicalOutline, addOutline });
    effect(() => {
      const id = this.params()?.get('id') ?? '';
      this.auth.user(); this.auth.session();
      untracked(() => { this.flockId.set(id); void this.load(); });
    });
    effect(() => {
      const success = this.success();
      const contextError = this.application.contextError();
      untracked(() => {
        if (success) { this.editor()?.forceClose(); void this.loadHistory(); }
        if (contextError) { this.editor()?.forceClose(); this.actionError.set(contextError); }
      });
    });
    this.destroyRef.onDestroy(() => { this.version++; this.editor()?.forceClose(); });
  }

  async load(): Promise<void> {
    const version = ++this.version;
    this.editor()?.forceClose();
    this.application.reset(this.flockId());
    this.rows.set([]); this.houseName.set(null);
    this.state.set('loading'); this.historyState.set('loading');
    if (!this.canView()) { this.state.set('forbidden'); return; }
    if (!this.flockId()) { this.state.set('not-found'); return; }
    try {
      const flock = await firstValueFrom(this.detail.flock(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)));
      if (!this.current(version)) return;
      this.flock.set(flock); this.state.set('ready');
      void this.loadHistory();
      void firstValueFrom(this.productionUnits.getPoultryHouseById(flock.poultry_house_id))
        .then((response) => { if (this.current(version)) this.houseName.set(response.data.name); }).catch(() => {});
    } catch (error) { if (this.current(version)) this.state.set(this.errorState(error)); }
  }

  async loadHistory(): Promise<void> {
    const version = this.version;
    const historyVersion = ++this.historyVersion;
    this.historyState.set('loading');
    this.rows.set([]); this.visibleCount.set(20);
    try {
      const rows = await firstValueFrom(this.health.history(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)));
      if (!this.current(version) || historyVersion !== this.historyVersion) return;
      this.rows.set(rows); this.historyState.set('ready');
    } catch (error) { if (this.current(version) && historyVersion === this.historyVersion) this.historyState.set(this.errorState(error)); }
  }

  openApplication(): void {
    if (!this.canApply() || this.saving() || this.uncertain()) return;
    this.editor()?.open();
    this.application.begin();
  }

  loadEditorData(): Promise<void> { return this.application.loadEditorData(); }
  save(request: HealthApplicationDraft): Promise<void> { return this.application.save(request); }
  retry(): Promise<void> { return this.application.retry(); }
  canLeave(): boolean { return this.application.canLeave(); }
  private current(version: number): boolean { return this.version === version && !this.destroyRef.destroyed; }
  private errorState(error: unknown): HealthLoadState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'offline';
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 404) return 'not-found';
    }
    return 'error';
  }
}
