import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, DestroyRef, effect, inject, Injector, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, forkJoin } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { Flock } from '../../interfaces/flock.interface';
import { CancelMortalityRequest, FlockMortality, MortalityCancellationSubmission } from '../../interfaces/flock-mortality.interface';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockMortalitiesService } from '../../services/flock-mortalities.service';
import { FlockMortalitySectionComponent } from '../flock-mortality-section/flock-mortality-section.component';

@Component({
  selector: 'app-mortality-undo',
  imports: [FlockMortalitySectionComponent],
  template: `@if (flock(); as item) {
    <app-flock-mortality-section [flock]="item" [records]="records()" state="ready"
      [cancellationOnly]="true" [cancelling]="saving()" [cancellationBlocked]="blocked()"
      [cancellationError]="error()" [cancellationReasonError]="reasonError()"
      (cancellationSubmitted)="save($event)" (cancellationClosed)="close()"
      (cancellationEdited)="clearErrors()" />
  }`,
})
export class MortalityUndoComponent {
  private readonly api = inject(FlockMortalitiesService);
  private readonly detail = inject(FlockDetailService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly section = viewChild(FlockMortalitySectionComponent);
  private version = 0;
  private owner = '';
  private recordId = '';
  private trigger: HTMLElement | null = null;
  private attempt: { fingerprint: string; key: string } | null = null;
  readonly flock = signal<Flock | null>(null);
  readonly records = signal<FlockMortality[]>([]);
  readonly isOpen = signal(false);
  readonly saving = signal(false);
  readonly blocked = signal(false);
  readonly error = signal<string | null>(null);
  readonly reasonError = signal<string | null>(null);
  readonly undone = output<void>();
  readonly closed = output<void>();
  readonly failed = output<number>();

  constructor() {
    effect(() => {
      const identity = this.identity();
      untracked(() => { if (this.owner && this.owner !== identity) this.invalidate(); });
    });
    this.destroyRef.onDestroy(() => this.version++);
  }

  private identity(): string { return JSON.stringify([this.auth.user(), this.auth.session?.(), this.auth.status?.()]); }

  async open(flockId: string, recordId: string, trigger: HTMLElement | null): Promise<void> {
    if (!this.auth.user() || this.isOpen() || this.saving()) return;
    const version = ++this.version;
    this.owner = this.identity(); this.recordId = recordId; this.trigger = trigger;
    this.attempt = null; this.blocked.set(false); this.clearErrors(); this.isOpen.set(true);
    try {
      const data = await firstValueFrom(forkJoin({ flock: this.detail.flock(flockId), records: this.api.list(flockId) })
        .pipe(takeUntilDestroyed(this.destroyRef)));
      if (version !== this.version || this.owner !== this.identity()) return;
      const record = data.records.find((item) => item.id === recordId && item.status === 'recorded');
      if (data.flock.id !== flockId || !record) throw new Error('Mortalidad no disponible');
      this.records.set(data.records); this.flock.set(data.flock);
      afterNextRender(() => {
        if (version === this.version && this.isOpen() && this.owner === this.identity()) this.section()?.openCancellation(record);
      }, { injector: this.injector });
    } catch (error) {
      if (version === this.version) this.invalidate();
      throw error;
    }
  }

  clearErrors(): void {
    if (!this.blocked()) { this.error.set(null); this.reasonError.set(null); }
  }

  invalidate(): void {
    this.version++; this.saving.set(false); this.blocked.set(true);
    this.section()?.invalidateCancellation();
    this.isOpen.set(false); this.flock.set(null); this.records.set([]);
    this.owner = ''; this.trigger = null; this.attempt = null;
  }

  close(): void {
    if (this.saving()) return;
    const trigger = this.trigger;
    this.invalidate();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    this.closed.emit();
  }

  async save(submission: MortalityCancellationSubmission): Promise<void> {
    const flock = this.flock();
    if (!flock || !this.isOpen() || this.saving() || this.blocked() || !this.auth.user() || this.owner !== this.identity()) return;
    const record = this.records().find((item) => item.id === submission.recordId && item.id === this.recordId && item.status === 'recorded');
    const reason = submission.request.reason.trim();
    if (!record || record.version !== submission.request.version || flock.version !== submission.request.flock_version
      || !reason || reason.length > 500
      || (flock.status === 'finished' && flock.current_quantity + record.quantity > 0 && submission.request.confirm_reactivation !== true)) return;
    const request: CancelMortalityRequest = { version: record.version, flock_version: flock.version, reason,
      ...(submission.request.confirm_reactivation === true ? { confirm_reactivation: true } : {}) };
    const fingerprint = JSON.stringify([this.owner, flock.id, record.id, request]);
    if (this.attempt?.fingerprint !== fingerprint) this.attempt = { fingerprint, key: crypto.randomUUID() };
    const version = this.version;
    this.clearErrors(); this.saving.set(true);
    try {
      await firstValueFrom(this.api.cancel(record.id, request, this.attempt.key).pipe(takeUntilDestroyed(this.destroyRef)));
      if (version !== this.version || this.owner !== this.identity()) return;
      this.saving.set(false); this.close(); this.undone.emit();
    } catch (error) {
      if (version !== this.version || this.owner !== this.identity()) return;
      this.saving.set(false);
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
      const problem = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      const fields = problem['errors'];
      const reasons: unknown = fields && typeof fields === 'object' ? (fields as Record<string, unknown>)['reason'] : null;
      this.reasonError.set(status === 422 && Array.isArray(reasons) ? reasons.find((value: unknown) => typeof value === 'string') ?? null : null);
      const detail = problem['detail'];
      this.error.set(status === 422 ? 'Revisa los datos antes de deshacer el registro.'
        : [401, 403].includes(status) ? 'Ya no tienes permiso para deshacer este registro.'
          : status === 404 ? 'El registro ya no está disponible. Cierra esta confirmación y actualiza el detalle.'
            : status === 409 ? (typeof detail === 'string' ? detail : 'Los datos cambiaron. Cierra esta confirmación y revisa el detalle actualizado.')
              : 'No se pudo deshacer el registro. Puedes reintentar con los mismos datos.');
      if ([401, 403, 404, 409].includes(status)) this.blocked.set(true);
      if ([401, 403, 404, 409, 422].includes(status)) this.attempt = null;
      this.failed.emit(status);
    }
  }
}
