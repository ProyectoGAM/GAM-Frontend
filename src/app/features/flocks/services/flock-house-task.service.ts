import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { FeedBalance, FeedingRecipeOption, FeedingSubmission, FlockFeeding } from '../interfaces/flock-feeding.interface';
import { FlockHouseTaskRequest } from '../interfaces/flock-house-task.interface';
import { MortalityFieldErrors, MortalitySubmission, RecordMortalityRequest } from '../interfaces/flock-mortality.interface';
import { Flock } from '../interfaces/flock.interface';
import { FeedingLoadState } from '../types/feeding-state.type';
import { snapshotRecipeName } from './feeding-summary';
import { FlockDetailService } from './flock-detail.service';
import { FlockFeedingService } from './flock-feeding.service';
import { FlockMortalitiesService } from './flock-mortalities.service';
import { buildMortalityRequest } from './mortality-record-form';

/** Scoped to one quick task; destroying its dialog cancels pending requests. */
@Injectable()
export class FlockHouseTaskService {
  private readonly detail = inject(FlockDetailService);
  private readonly mortalityApi = inject(FlockMortalitiesService);
  private readonly feedingApi = inject(FlockFeedingService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private request: FlockHouseTaskRequest | null = null;
  private loadVersion = 0;
  private balancesVersion = 0;
  private actorId: number | undefined;
  private attempt: { fingerprint: string; key: string; mortality?: RecordMortalityRequest } | null = null;
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly loadError = signal<string | null>(null);
  readonly flock = signal<Flock | null>(null);
  readonly feeding = signal<FlockFeeding | null>(null);
  readonly balances = signal<FeedBalance[]>([]);
  readonly balancesState = signal<FeedingLoadState>('loading');
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly fieldErrors = signal<MortalityFieldErrors>({});
  readonly result = signal<string | null>(null);
  readonly options = computed<FeedingRecipeOption[]>(() => this.balances()
    .filter((balance) => balance.up_id === this.flock()?.production_unit_id
      && balance.estado_receta === 'active' && BigInt(balance.saldo_g) > 0n)
    .map((balance) => ({ id: balance.receta_id, name: balance.nombre_receta, balance: balance.saldo_g, inactive: false }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es') || left.id - right.id));
  readonly currentRecipe = computed(() => {
    const feeding = this.feeding();
    return feeding ? this.balances().find((balance) => balance.receta_id === feeding.receta_id
      && balance.up_id === this.flock()?.production_unit_id)?.nombre_receta
      ?? snapshotRecipeName(feeding.etapa, feeding.receta_id) ?? `Receta #${feeding.receta_id}` : '';
  });

  start(request: FlockHouseTaskRequest): void {
    this.request = request;
    this.actorId = this.auth.user()?.id;
    this.load();
  }

  load(): void {
    if (!this.request || this.saving()) return;
    const request = this.request;
    const version = ++this.loadVersion;
    this.balancesVersion++;
    this.state.set('loading'); this.loadError.set(null); this.flock.set(null); this.feeding.set(null);
    this.balances.set([]); this.clearErrors(); this.attempt = null;
    if (!this.auth.user()) { this.fail('No tenés acceso para realizar esta tarea.'); return; }
    this.detail.flock(request.flockId).pipe(switchMap((flock) => {
      if (version !== this.loadVersion || !this.acceptFlock(flock)) return of(null);
      this.flock.set(flock);
      return request.kind === 'feeding' ? this.feedingApi.current(flock.id) : of(null);
    }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (feeding) => {
        if (version !== this.loadVersion || this.state() === 'error') return;
        if (request.kind === 'feeding' && (!feeding || feeding.finalizado)) {
          this.fail('No hay una configuración de alimentación vigente para este lote.'); return;
        }
        this.feeding.set(feeding); this.state.set('ready');
        if (request.kind === 'feeding') this.loadBalances();
      },
      error: (error: unknown) => {
        if (version === this.loadVersion) this.fail(this.errorMessage(error, 'No se pudieron cargar los datos de la tarea.'));
      },
    });
  }

  loadBalances(): void {
    const unit = this.flock()?.production_unit_id;
    if (!unit || this.saving()) return;
    const version = ++this.balancesVersion;
    this.balancesState.set('loading');
    this.feedingApi.balances(unit).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (balances) => {
        if (version !== this.balancesVersion) return;
        this.balances.set(balances); this.balancesState.set('ready');
      },
      error: () => { if (version === this.balancesVersion) this.balancesState.set('error'); },
    });
  }

  clearErrors(): void { this.saveError.set(null); this.fieldErrors.set({}); }

  saveMortality(submission: MortalitySubmission): void {
    const flock = this.flock();
    if (this.request?.kind !== 'mortality' || !flock || !this.canSave(flock)) return;
    this.clearErrors();
    const { draft, excessConfirmation } = submission;
    if (draft.quantity > Math.max(0, flock.current_quantity)
      && (!excessConfirmation || excessConfirmation.version !== flock.version || excessConfirmation.balance !== flock.current_quantity)) {
      this.saveError.set('Confirmá que se está superando la cantidad viva actual del lote.'); return;
    }
    const fingerprint = JSON.stringify([flock.id, flock.version, draft.date, draft.quantity, draft.reason.trim()]);
    const previous = this.attempt?.fingerprint === fingerprint ? this.attempt : null;
    const request = previous?.mortality ?? buildMortalityRequest(flock, draft);
    if (!request) { this.saveError.set('Revisá la fecha, la cantidad y el motivo antes de guardar.'); return; }
    const key = previous?.key ?? crypto.randomUUID();
    this.attempt = { fingerprint, key, mortality: request };
    this.saving.set(true);
    this.mortalityApi.record(flock.id, request, key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); this.attempt = null; this.result.set('Mortandad registrada.'); },
      error: (error: unknown) => this.handleSaveError(error),
    });
  }

  saveFeeding(submission: FeedingSubmission): void {
    const flock = this.flock(); const feeding = this.feeding();
    if (this.request?.kind !== 'feeding' || !flock || !feeding || feeding.finalizado || !this.canSave(flock)) return;
    this.clearErrors();
    const automatic = submission.mode === 'automatico';
    if (automatic && feeding.modo === 'automatico') return;
    if (!automatic && submission.recipeId !== null && (this.balancesState() !== 'ready'
      || !this.options().some((option) => option.id === submission.recipeId))) {
      this.saveError.set('La receta ya no está disponible. Revisá la selección.'); return;
    }
    if (!automatic && ((submission.recipeId === null && submission.grams === null)
      || (submission.grams !== null && !/^[1-9]\d{0,11}$/.test(submission.grams)))) return;
    const request = automatic ? {} : {
      ...(submission.recipeId === null ? {} : { receta_id: submission.recipeId }),
      ...(submission.grams === null ? {} : { cantidad_diaria_g: submission.grams }),
    };
    const fingerprint = JSON.stringify([flock.id, automatic, request]);
    if (this.attempt?.fingerprint !== fingerprint) this.attempt = { fingerprint, key: crypto.randomUUID() };
    this.saving.set(true);
    const operation = automatic ? this.feedingApi.automatic(flock.id, this.attempt.key)
      : this.feedingApi.change(flock.id, request, this.attempt.key);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); this.attempt = null; this.result.set('Alimentación actualizada.'); },
      error: (error: unknown) => this.handleSaveError(error),
    });
  }

  private canSave(flock: Flock): boolean {
    return !this.saving() && !this.result() && this.state() === 'ready' && this.actorId !== undefined
      && this.auth.user()?.id === this.actorId && this.acceptFlock(flock);
  }

  private acceptFlock(flock: Flock): boolean {
    const request = this.request;
    if (!request || flock.id !== request.flockId || flock.production_unit_id !== request.origin.unitId
      || flock.poultry_house_id !== request.origin.houseId) {
      this.fail('El lote cambió de galpón. Actualizá la instalación antes de continuar.'); return false;
    }
    if (flock.status === 'finished') { this.fail('El lote está finalizado y no admite nuevas tareas.'); return false; }
    return true;
  }

  private handleSaveError(error: unknown): void {
    this.saving.set(false);
    this.saveError.set(this.errorMessage(error, 'No se pudo guardar. Podés reintentar con los mismos datos.'));
    if (!(error instanceof HttpErrorResponse)) return;
    if ([401, 403, 409, 422].includes(error.status)) this.attempt = null;
    if (error.status === 422 && this.request?.kind === 'mortality') {
      const problem = this.problem(error);
      const errors = problem?.['errors'];
      const fields: MortalityFieldErrors = {};
      const mapping: Record<string, keyof MortalityFieldErrors> = { occurred_at: 'date', quantity: 'quantity', notes: 'reason' };
      if (errors && typeof errors === 'object') for (const [name, values] of Object.entries(errors)) {
        const field = mapping[name];
        const message: unknown = Array.isArray(values) ? values.find((value: unknown) => typeof value === 'string') : null;
        if (field && typeof message === 'string') fields[field] = message;
      }
      this.fieldErrors.set(fields);
    }
    if (error.status === 409 && this.request) {
      this.saving.set(true);
      this.detail.flock(this.request.flockId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (flock) => { if (this.acceptFlock(flock)) this.flock.set(flock); this.saving.set(false); },
        error: () => {
          this.saving.set(false);
          this.fail('El lote cambió y no se pudieron actualizar sus datos. Reintentá la consulta antes de guardar.');
        },
      });
    }
  }

  private fail(message: string): void { this.loadError.set(message); this.state.set('error'); }

  private problem(error: HttpErrorResponse): Record<string, unknown> | null {
    const body: unknown = error.error;
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    if ([401, 403].includes(error.status)) return 'No tenés permiso para realizar esta tarea.';
    if (error.status === 0) return 'Sin conexión. Reintentá con los mismos datos al recuperar la conexión.';
    const problem = this.problem(error);
    const errors = problem?.['errors'];
    if (errors && typeof errors === 'object') {
      const messages = Object.values(errors).flat().filter((value): value is string => typeof value === 'string');
      if (messages.length) return messages.join(' ');
    }
    const message = problem?.['detail'] ?? problem?.['message'];
    return typeof message === 'string' ? message : fallback;
  }
}
