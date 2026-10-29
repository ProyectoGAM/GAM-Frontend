import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { forkJoin } from 'rxjs';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FlockMortalitySectionComponent } from '../../components/flock-mortality-section/flock-mortality-section.component';
import { Flock } from '../../interfaces/flock.interface';
import { CancelMortalityRequest, FlockMortality, MortalityCancellationSubmission, MortalityFieldErrors, MortalitySubmission, RecordMortalityRequest } from '../../interfaces/flock-mortality.interface';
import { FlockDetailService, todayInLotsTimezone } from '../../services/flock-detail.service';
import { FlockMortalitiesService } from '../../services/flock-mortalities.service';
import { buildMortalityRequest } from '../../services/mortality-record-form';
import { MortalityLoadState } from '../../types/mortality-state.type';
import { FlockHouseTaskContext } from '../../services/flock-house-task-context';

@Component({
  selector: 'app-flock-mortalities-page',
  imports: [RouterLink, IonIcon, IonSpinner, FlockMortalitySectionComponent],
  templateUrl: './flock-mortalities.page.html',
  styleUrl: './flock-mortalities.page.scss',
  providers: [FlockHouseTaskContext],
})
export class FlockMortalitiesPage {
  readonly houseTask = inject(FlockHouseTaskContext);
  readonly houseMismatch = computed(() => !this.houseTask.matches(this.flock()));
  private readonly route = inject(ActivatedRoute);
  private readonly detail = inject(FlockDetailService);
  private readonly mortalitiesApi = inject(FlockMortalitiesService);
  private readonly productionUnits = inject(ProductionUnitsService);
  private readonly unitContext = inject(AdminUnitContextService);
  private readonly destroyRef = inject(DestroyRef);
  private loadVersion = 0;
  private historyVersion = 0;
  private saveVersion = 0;
  private saveAttempt: { fingerprint: string; request: RecordMortalityRequest; key: string } | null = null;
  private cancellationVersion = 0;
  private cancellationAttempt: { fingerprint: string; request: CancelMortalityRequest; key: string } | null = null;

  readonly flockId = signal('');
  readonly flock = signal<Flock | null>(null);
  readonly state = signal<MortalityLoadState | 'not-found'>('loading');
  readonly historyState = signal<MortalityLoadState>('loading');
  readonly records = signal<FlockMortality[]>([]);
  readonly houseName = signal<string | null>(null);
  readonly today = signal(todayInLotsTimezone());
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly fieldErrors = signal<MortalityFieldErrors>({});
  readonly savedSequence = signal(0);
  readonly success = signal<string | null>(null);
  readonly cancelling = signal(false);
  readonly cancellationError = signal<string | null>(null);
  readonly cancellationReasonError = signal<string | null>(null);
  readonly cancelledSequence = signal(0);
  readonly unitName = computed(() => this.unitContext.units()
    .find((unit) => unit.id === this.flock()?.production_unit_id)?.name ?? null);
  readonly backLink = computed(() => this.houseTask.backLink() ?? `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}`);
  readonly statusText = computed(() => this.flock()
    ? { active: 'Activo', quarantined: 'En cuarentena', finished: 'Finalizado' }[this.flock()!.status] : '');

  constructor() {
    addIcons({ arrowBackOutline });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.flockId.set(params.get('id') ?? '');
      this.load();
    });
  }

  load(): void {
    const version = ++this.loadVersion;
    this.historyVersion++;
    this.saveVersion++;
    this.cancellationVersion++;
    this.cancellationAttempt = null;
    this.cancelling.set(false);
    this.clearCancellationErrors();
    this.saveAttempt = null;
    this.saving.set(false);
    this.success.set(null);
    this.clearSaveErrors();
    this.state.set('loading');
    this.flock.set(null);
    this.houseName.set(null);
    this.records.set([]);
    this.historyState.set('loading');
    const id = this.flockId();
    if (!id) { this.state.set('not-found'); return; }
    this.detail.flock(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (flock) => {
        if (version !== this.loadVersion) return;
        this.flock.set(flock);
        this.state.set('ready');
        if (!this.houseTask.isTask()) this.loadHistory();
        this.productionUnits.getPoultryHouseById(flock.poultry_house_id)
          .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (response) => { if (version === this.loadVersion) this.houseName.set(response.data.name); },
            error: () => { if (version === this.loadVersion) this.houseName.set('Galpón no disponible'); },
          });
      },
      error: (error: unknown) => {
        if (version === this.loadVersion) this.state.set(this.errorState(error, true));
      },
    });
  }

  prepareForm(): void {
    this.today.set(todayInLotsTimezone());
    this.success.set(null);
    this.clearSaveErrors();
  }

  clearSaveErrors(): void {
    this.saveError.set(null);
    this.fieldErrors.set({});
  }

  saveMortality(submission: MortalitySubmission): void {
    const flock = this.flock();
    if (!flock || this.saving() || this.cancelling() || this.houseMismatch() || flock.status === 'finished') return;
    this.clearSaveErrors();
    const { draft, excessConfirmation } = submission;
    if (draft.quantity > Math.max(0, flock.current_quantity)
      && (!excessConfirmation || excessConfirmation.version !== flock.version || excessConfirmation.balance !== flock.current_quantity)) {
      this.saveError.set('Confirmá que se está superando la cantidad viva actual del lote.');
      return;
    }
    const fingerprint = JSON.stringify([flock.id, flock.version, draft.date, draft.quantity, draft.reason.trim()]);
    const previous = this.saveAttempt?.fingerprint === fingerprint ? this.saveAttempt : null;
    const request = previous?.request ?? buildMortalityRequest(flock, draft);
    if (!request) { this.saveError.set('Revisá la fecha, la cantidad y el motivo antes de guardar.'); return; }
    const key = previous?.key ?? globalThis.crypto.randomUUID();
    this.saveAttempt = { fingerprint, request, key };
    const version = ++this.saveVersion;
    this.saving.set(true);
    this.mortalitiesApi.record(flock.id, request, key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (version !== this.saveVersion) return;
        this.saveAttempt = null;
        this.saving.set(false);
        this.flock.update((current) => current ? { ...current, ...response.flock } : null);
        this.success.set('Mortandad registrada.');
        this.savedSequence.update((sequence) => sequence + 1);
        if (this.houseTask.isTask()) this.houseTask.returnToHouse('Mortandad registrada.');
        else this.loadHistory();
      },
      error: (error: unknown) => {
        if (version !== this.saveVersion) return;
        this.handleSaveError(error, version);
      },
    });
  }

  private handleSaveError(error: unknown, version: number): void {
    this.saving.set(false);
    if (!(error instanceof HttpErrorResponse)) {
      this.saveError.set('No se pudo guardar el registro. Podés reintentar con los mismos datos.');
      return;
    }
    const body: unknown = error.error;
    const problem = body && typeof body === 'object' ? body as Record<string, unknown> : null;
    if ([401, 403, 409, 422].includes(error.status)) this.saveAttempt = null;
    if (error.status === 422) {
      const fields: MortalityFieldErrors = {};
      const errors = problem?.['errors'];
      if (errors && typeof errors === 'object') {
        const mapping: Record<string, keyof MortalityFieldErrors> = { occurred_at: 'date', quantity: 'quantity', notes: 'reason' };
        for (const [name, values] of Object.entries(errors)) {
          const field = mapping[name];
          const message: unknown = Array.isArray(values) ? values.find((value: unknown) => typeof value === 'string') : null;
          if (field && typeof message === 'string') fields[field] = message;
        }
      }
      this.fieldErrors.set(fields);
      this.saveError.set('Revisá los campos señalados.');
    } else if (error.status === 409) {
      const detail = problem?.['detail'];
      this.saveError.set(typeof detail === 'string' ? detail : 'El lote cambió. Revisá los datos antes de reintentar.');
      this.saving.set(true);
      this.detail.flock(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (flock) => { if (version === this.saveVersion) { this.flock.set(flock); this.saving.set(false); } },
        error: () => { if (version === this.saveVersion) {
          this.saving.set(false);
          this.saveError.update((message) => `${message} No se pudo actualizar el lote; revisá la conexión y reintentá.`);
        } },
      });
    } else if (error.status === 401 || error.status === 403) {
      this.saveError.set('No tenés permiso para registrar mortandad.');
    } else if (error.status === 0) {
      this.saveError.set('Sin conexión. Reintentá con los mismos datos para evitar duplicados.');
    } else {
      this.saveError.set('No se pudo guardar el registro. Podés reintentar con los mismos datos.');
    }
  }

  prepareCancellation(): void {
    this.success.set(null);
    this.clearCancellationErrors();
  }

  clearCancellationErrors(): void {
    this.cancellationError.set(null);
    this.cancellationReasonError.set(null);
  }

  cancelMortality(submission: MortalityCancellationSubmission): void {
    const flock = this.flock();
    if (!flock || this.saving() || this.cancelling()) return;
    this.clearCancellationErrors();
    const { recordId, request } = submission;
    const record = this.records().find((item) => item.id === recordId && item.status === 'recorded');
    if (!record || record.version !== request.version || flock.version !== request.flock_version) {
      this.cancellationError.set('Los datos cambiaron. Revisá el registro actualizado y confirmá nuevamente.');
      return;
    }
    if (!request.reason.trim() || request.reason.length > 500) {
      this.cancellationReasonError.set('Ingresá un motivo de hasta 500 caracteres; no puede quedar vacío.');
      return;
    }
    if (flock.status === 'finished' && flock.current_quantity + record.quantity > 0 && request.confirm_reactivation !== true) {
      this.cancellationError.set('Confirmá también la reactivación del lote finalizado.');
      return;
    }
    const fingerprint = JSON.stringify([flock.id, recordId, request.version, request.flock_version,
      request.reason, request.confirm_reactivation === true]);
    const previous = this.cancellationAttempt?.fingerprint === fingerprint ? this.cancellationAttempt : null;
    const attempt = previous ?? { fingerprint, request: { ...request }, key: globalThis.crypto.randomUUID() };
    this.cancellationAttempt = attempt;
    const version = ++this.cancellationVersion;
    this.cancelling.set(true);
    this.mortalitiesApi.cancel(recordId, attempt.request, attempt.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (version !== this.cancellationVersion) return;
        this.cancellationAttempt = null;
        this.cancelling.set(false);
        this.flock.update((current) => current ? { ...current, ...response.flock } : null);
        this.records.update((records) => records.filter((item) => item.id !== recordId));
        this.success.set('Registro de mortandad deshecho. La acción quedó auditada.');
        this.cancelledSequence.update((sequence) => sequence + 1);
        this.loadHistory();
      },
      error: (error: unknown) => {
        if (version === this.cancellationVersion) this.handleCancellationError(error, version);
      },
    });
  }

  private handleCancellationError(error: unknown, version: number): void {
    this.cancelling.set(false);
    if (!(error instanceof HttpErrorResponse)) {
      this.cancellationError.set('No se pudo deshacer el registro. Podés reintentar con los mismos datos.');
      return;
    }
    const body: unknown = error.error;
    const problem = body && typeof body === 'object' ? body as Record<string, unknown> : null;
    if ([401, 403, 404, 409, 422].includes(error.status)) this.cancellationAttempt = null;
    if (error.status === 422) {
      const errors = problem?.['errors'];
      const reasons: unknown = errors && typeof errors === 'object' ? (errors as Record<string, unknown>)['reason'] : null;
      const message: unknown = Array.isArray(reasons) ? reasons.find((value: unknown) => typeof value === 'string') : null;
      this.cancellationReasonError.set(typeof message === 'string' ? message : null);
      this.cancellationError.set('Revisá los datos antes de deshacer el registro.');
    } else if (error.status === 409 || error.status === 404) {
      const detail = problem?.['detail'];
      this.cancellationError.set(typeof detail === 'string' ? detail : 'El lote o el registro cambió. Revisá los datos actualizados.');
      this.cancelling.set(true);
      // Keep the dialog and its reason while refreshing both optimistic versions together.
      this.historyVersion++;
      forkJoin({ flock: this.detail.flock(this.flockId()), records: this.mortalitiesApi.list(this.flockId()) })
        .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: ({ flock, records }) => {
            if (version !== this.cancellationVersion) return;
            this.flock.set(flock);
            this.records.set(records);
            this.historyState.set('ready');
            this.cancelling.set(false);
          },
          error: () => {
            if (version !== this.cancellationVersion) return;
            this.cancelling.set(false);
            this.cancellationError.update((message) => `${message} No se pudieron actualizar los datos; revisá la conexión y reintentá.`);
          },
        });
    } else if (error.status === 401 || error.status === 403) {
      this.cancellationError.set('No tenés permiso para deshacer registros de mortandad.');
    } else if (error.status === 0) {
      this.cancellationError.set('Sin conexión. Reintentá con los mismos datos para evitar repetir la acción.');
    } else {
      this.cancellationError.set('No se pudo deshacer el registro. Podés reintentar con los mismos datos.');
    }
  }

  loadHistory(): void {
    const version = ++this.historyVersion;
    this.today.set(todayInLotsTimezone());
    this.historyState.set('loading');
    this.records.set([]);
    this.mortalitiesApi.list(this.flockId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (records) => {
        if (version !== this.historyVersion) return;
        this.records.set(records);
        this.historyState.set('ready');
      },
      error: (error: unknown) => {
        if (version !== this.historyVersion) return;
        const state = this.errorState(error);
        this.historyState.set(state === 'not-found' ? 'error' : state);
      },
    });
  }

  private errorState(error: unknown, notFound = false): MortalityLoadState | 'not-found' {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404 && notFound) return 'not-found';
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 0) return 'offline';
    }
    return 'error';
  }
}
