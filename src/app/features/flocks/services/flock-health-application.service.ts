import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { isAdminUser } from '../../../core/auth/access-policy';
import { FlockPlan, PlanCatalogOption } from '../../management-plans/interfaces/management-plan';
import { ManagementPlansService } from '../../management-plans/services/management-plans.service';
import { FlockHouseOrigin } from '../interfaces/flock-detail.interface';
import { HealthApplicationDraft } from '../interfaces/flock-health.interface';
import { Flock } from '../interfaces/flock.interface';
import { FlockDetailService } from './flock-detail.service';
import { FlockHealthService } from './flock-health.service';

/** One application session, scoped to its owning page or dialog. */
@Injectable()
export class FlockHealthApplicationService {
  private readonly auth = inject(AuthStore);
  private readonly detail = inject(FlockDetailService);
  private readonly health = inject(FlockHealthService);
  private readonly plans = inject(ManagementPlansService);
  private readonly destroyRef = inject(DestroyRef);
  private version = 0;
  private dataVersion = 0;
  private origin: FlockHouseOrigin | null = null;
  private actor = this.auth.user();
  private session = this.auth.session();
  private attempt: { request: HealthApplicationDraft; key: string; flockId: string } | null = null;
  readonly flockId = signal('');
  readonly flock = signal<Flock | null>(null);
  readonly plan = signal<FlockPlan | null>(null);
  readonly vaccines = signal<PlanCatalogOption[]>([]);
  readonly medicines = signal<PlanCatalogOption[]>([]);
  readonly dataReady = signal(false);
  readonly dataError = signal<string | null>(null);
  readonly contextError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly uncertain = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canExecute = computed(() => isAdminUser(this.auth.user()) || this.auth.user()?.permissions?.includes('management-plans.execute') === true);
  readonly canApply = computed(() => this.canExecute() && this.flock() !== null && this.flock()?.status !== 'finished' && !this.contextError());

  reset(id: string, origin: FlockHouseOrigin | null = null): void {
    this.version++;
    this.actor = this.auth.user(); this.session = this.auth.session(); this.origin = origin;
    this.flockId.set(id); this.flock.set(null); this.plan.set(null);
    this.vaccines.set([]); this.medicines.set([]);
    this.dataReady.set(false); this.dataError.set(null); this.contextError.set(null);
    this.saving.set(false); this.uncertain.set(false); this.attempt = null;
    this.actionError.set(null); this.success.set(null);
  }

  begin(): void {
    this.actionError.set(null); this.success.set(null); this.attempt = null;
    void this.loadEditorData();
  }

  async loadEditorData(): Promise<void> {
    if (this.saving() || this.uncertain()) return;
    const version = this.version;
    const dataVersion = ++this.dataVersion;
    this.dataReady.set(false); this.dataError.set(null); this.contextError.set(null);
    if (!this.canExecute()) { this.dataError.set('No tenés permiso para registrar aplicaciones de sanidad.'); return; }
    try {
      const [vaccines, medicines, plan, flock] = await Promise.all([
        this.plans.catalogOptions('vaccination'), this.plans.catalogOptions('medication'),
        firstValueFrom(this.plans.flockPlan(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef))).then((response) => response.data)
          .catch((error: unknown) => { if (error instanceof HttpErrorResponse && error.status === 404) return null; throw error; }),
        firstValueFrom(this.detail.flock(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef))),
      ]);
      if (!this.current(version) || dataVersion !== this.dataVersion) return;
      this.flock.set(flock);
      if (flock.id !== this.flockId() || (this.origin && (flock.production_unit_id !== this.origin.unitId || flock.poultry_house_id !== this.origin.houseId))) {
        this.contextError.set('El lote cambió de galpón. Actualizá la instalación antes de continuar.'); return;
      }
      if (flock.status === 'finished') {
        this.contextError.set('El lote está finalizado y no admite nuevas aplicaciones.'); return;
      }
      this.plan.set(plan); this.vaccines.set(vaccines); this.medicines.set(medicines);
      this.dataReady.set(true);
    } catch (error) {
      if (!this.current(version) || dataVersion !== this.dataVersion) return;
      this.dataError.set(error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)
        ? 'No tenés permiso para consultar el lote, los catálogos o el plan necesarios para registrar la aplicación.'
        : 'No se pudieron cargar el lote, los catálogos y el plan. Reintentá antes de registrar.');
    }
  }

  async save(request: HealthApplicationDraft): Promise<void> {
    if (!this.canApply() || this.saving() || this.uncertain() || this.success() || !this.dataReady() || !this.current(this.version)) return;
    this.attempt = { request, flockId: this.flockId(), key: crypto.randomUUID() };
    await this.send();
  }

  async retry(): Promise<void> { if (this.uncertain() && !this.saving() && this.canExecute()) await this.send(); }

  canLeave(): boolean { return !this.saving() && !this.uncertain(); }

  private async send(): Promise<void> {
    const attempt = this.attempt;
    if (!attempt || !this.current(this.version)) return;
    const version = this.version;
    this.saving.set(true); this.actionError.set(null);
    try {
      await firstValueFrom(this.health.record(attempt.flockId, attempt.request, attempt.key).pipe(takeUntilDestroyed(this.destroyRef)));
      if (!this.current(version)) return;
      this.saving.set(false); this.uncertain.set(false); this.attempt = null;
      this.success.set('Aplicación registrada.');
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

  private current(version: number): boolean {
    return this.version === version && !this.destroyRef.destroyed && this.auth.user() === this.actor && this.auth.session() === this.session;
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
