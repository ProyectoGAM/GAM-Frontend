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
import { FlockPlan, PlanCatalogOption } from '../../../management-plans/interfaces/management-plan';
import { ManagementPlansService } from '../../../management-plans/services/management-plans.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { HealthApplicationComponent } from '../../components/health-application/health-application.component';
import { HealthApplicationDraft, HealthHistoryRow } from '../../interfaces/flock-health.interface';
import { Flock } from '../../interfaces/flock.interface';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockHealthService } from '../../services/flock-health.service';
import { HealthLoadState } from '../../types/flock-health.type';

@Component({
  selector: 'app-flock-health-page',
  imports: [RouterLink, IonIcon, IonSpinner, HealthApplicationComponent],
  templateUrl: './flock-health.page.html',
  styleUrl: './flock-health.page.scss',
})
export class FlockHealthPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthStore);
  private readonly detail = inject(FlockDetailService);
  private readonly health = inject(FlockHealthService);
  private readonly plans = inject(ManagementPlansService);
  private readonly units = inject(AdminUnitContextService);
  private readonly productionUnits = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = toSignal(this.route.paramMap);
  private readonly query = toSignal(this.route.queryParamMap);
  readonly editor = viewChild<HealthApplicationComponent>('editor');
  private version = 0;
  private dataVersion = 0;
  private historyVersion = 0;
  private attempt: { request: HealthApplicationDraft; key: string; flockId: string } | null = null;
  readonly flockId = signal('');
  readonly flock = signal<Flock | null>(null);
  readonly state = signal<HealthLoadState>('loading');
  readonly historyState = signal<HealthLoadState>('loading');
  readonly rows = signal<HealthHistoryRow[]>([]);
  readonly visibleCount = signal(20);
  readonly visibleRows = computed(() => this.rows().slice(0, this.visibleCount()));
  readonly houseName = signal<string | null>(null);
  readonly unitName = computed(() => this.units.units().find((unit) => unit.id === this.flock()?.production_unit_id)?.name ?? null);
  readonly plan = signal<FlockPlan | null>(null);
  readonly vaccines = signal<PlanCatalogOption[]>([]);
  readonly medicines = signal<PlanCatalogOption[]>([]);
  readonly dataReady = signal(false);
  readonly dataError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly uncertain = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canView = computed(() => isAdminUser(this.auth.user()) || this.auth.user()?.permissions?.includes('management-plans.view') === true);
  readonly canExecute = computed(() => isAdminUser(this.auth.user()) || this.auth.user()?.permissions?.includes('management-plans.execute') === true);
  readonly canApply = computed(() => this.canExecute() && this.flock() !== null && this.flock()?.status !== 'finished');
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
    this.destroyRef.onDestroy(() => { this.version++; this.editor()?.forceClose(); });
  }

  async load(): Promise<void> {
    const version = ++this.version;
    this.editor()?.forceClose();
    this.saving.set(false); this.uncertain.set(false); this.attempt = null;
    this.success.set(null); this.actionError.set(null);
    this.flock.set(null); this.rows.set([]); this.houseName.set(null);
    this.plan.set(null); this.vaccines.set([]); this.medicines.set([]); this.dataReady.set(false); this.dataError.set(null);
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
    this.actionError.set(null); this.success.set(null); this.attempt = null;
    this.editor()?.open();
    void this.loadEditorData();
  }

  async loadEditorData(): Promise<void> {
    if (this.saving() || this.uncertain()) return;
    const version = this.version;
    const dataVersion = ++this.dataVersion;
    this.dataReady.set(false); this.dataError.set(null);
    try {
      const [vaccines, medicines, plan, flock] = await Promise.all([
        this.plans.catalogOptions('vaccination'), this.plans.catalogOptions('medication'),
        firstValueFrom(this.plans.flockPlan(this.flockId())).then((response) => response.data)
          .catch((error: unknown) => { if (error instanceof HttpErrorResponse && error.status === 404) return null; throw error; }),
        firstValueFrom(this.detail.flock(this.flockId())),
      ]);
      if (!this.current(version) || dataVersion !== this.dataVersion) return;
      this.plan.set(plan); this.vaccines.set(vaccines); this.medicines.set(medicines); this.flock.set(flock);
      if (flock.status === 'finished') { this.editor()?.forceClose(); this.actionError.set('El lote está finalizado y no admite nuevas aplicaciones.'); return; }
      this.dataReady.set(true);
    } catch (error) {
      if (!this.current(version) || dataVersion !== this.dataVersion) return;
      this.dataError.set(this.errorState(error) === 'forbidden'
        ? 'No tenés permiso para consultar los catálogos o el plan necesarios para registrar la aplicación.'
        : 'No se pudieron cargar los catálogos y el plan. Reintentá antes de registrar.');
    }
  }

  async save(request: HealthApplicationDraft): Promise<void> {
    if (!this.canApply() || this.saving() || this.uncertain() || !this.dataReady()) return;
    this.attempt = { request, flockId: this.flockId(), key: crypto.randomUUID() };
    await this.send();
  }

  async retry(): Promise<void> { if (this.uncertain() && !this.saving() && this.canExecute()) await this.send(); }

  private async send(): Promise<void> {
    const attempt = this.attempt;
    if (!attempt) return;
    const version = this.version;
    this.saving.set(true); this.actionError.set(null);
    try {
      await firstValueFrom(this.health.record(attempt.flockId, attempt.request, attempt.key).pipe(takeUntilDestroyed(this.destroyRef)));
      if (!this.current(version)) return;
      this.saving.set(false); this.uncertain.set(false); this.attempt = null;
      this.editor()?.forceClose();
      this.success.set('Aplicación registrada.');
      void this.loadHistory();
    } catch (error) {
      if (!this.current(version)) return;
      this.saving.set(false);
      const uncertain = !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500;
      this.uncertain.set(uncertain);
      if (!uncertain) this.attempt = null;
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.dataReady.set(false); this.dataError.set('El lote o su plan cambió. Actualizá los datos antes de volver a registrar.');
      }
      this.actionError.set(error instanceof HttpErrorResponse && error.status === 422
        ? this.validationMessage(error) : uncertain ? 'No se pudo confirmar el registro. Reintentá la confirmación.'
          : error instanceof HttpErrorResponse && error.status === 403 ? 'No tenés permiso para registrar esta aplicación.'
            : 'No se pudo registrar la aplicación. Revisá los datos actualizados.');
    }
  }

  canLeave(): boolean { return !this.saving() && !this.uncertain(); }
  private current(version: number): boolean { return this.version === version && !this.destroyRef.destroyed; }
  private errorState(error: unknown): HealthLoadState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'offline';
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 404) return 'not-found';
    }
    return 'error';
  }
  private validationMessage(error: HttpErrorResponse): string {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'errors' in body && body.errors && typeof body.errors === 'object') {
      const messages = Object.values(body.errors).flat().filter((value): value is string => typeof value === 'string');
      if (messages.length) return messages.join(' ');
    }
    return 'Revisá la fecha, el producto, la actividad del plan y el motivo.';
  }
}
