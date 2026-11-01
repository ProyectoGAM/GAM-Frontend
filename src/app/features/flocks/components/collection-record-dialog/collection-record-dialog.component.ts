import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthStore } from '../../../../core/auth/auth.store';
import { CancelCollectionRequest, CorrectCollectionRequest, FlockCollection } from '../../interfaces/flock-collection.interface';
import { Flock } from '../../interfaces/flock.interface';
import { collectionDate, collectionLocalDateTime, collectionNumber } from '../../services/collection-summary';
import { todayInLotsTimezone } from '../../services/flock-detail.service';
import { FlockCollectionsService } from '../../services/flock-collections.service';

@Component({
  selector: 'app-collection-record-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './collection-record-dialog.component.html',
  styleUrl: './collection-record-dialog.component.scss',
})
export class CollectionRecordDialogComponent {
  private readonly api = inject(FlockCollectionsService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  private trigger: HTMLElement | null = null;
  private owner = '';
  private version = 0;
  private opened = false;
  private attempt: { fingerprint: string; key: string } | null = null;
  readonly flock = input.required<Flock>();
  readonly changed = output<'edited' | 'deleted'>();
  readonly refreshRequested = output<void>();
  readonly record = signal<FlockCollection | null>(null);
  readonly mode = signal<'detail' | 'edit' | 'delete'>('detail');
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly blocked = signal(false);
  readonly title = computed(() => ({ detail: 'Detalle de postura', edit: 'Editar postura', delete: 'Borrar postura' })[this.mode()]);
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-collections.manage') === true);
  readonly canChange = computed(() => this.canManage() && this.record()?.status === 'recorded' && !this.loading() && !this.loadError() && !this.saving() && !this.blocked());
  readonly details = computed(() => {
    const record = this.record();
    return record ? { ...record, date: collectionDate(todayInLotsTimezone(new Date(record.occurred_at))),
      time: collectionLocalDateTime(record.occurred_at).slice(11), quantityText: collectionNumber(record.quantity) } : null;
  });
  readonly maximumTime = signal('');
  readonly minimumTime = computed(() => collectionLocalDateTime(this.flock().established_at));
  readonly form = new FormGroup({
    quantity: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(2147483647),
      (control) => Number.isInteger(control.value) ? null : { integer: true }]),
    occurredAt: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500),
      (control) => String(control.value).trim() ? null : { required: true }] }),
  });

  constructor() {
    effect(() => {
      const owner = this.identity(); const flock = this.flock().id;
      untracked(() => { if (this.opened && (owner !== this.owner || this.record()?.flock_id !== flock)) this.invalidate(); });
    });
    this.destroyRef.onDestroy(() => this.invalidate());
  }
  private identity(): string { return JSON.stringify([this.auth.user(), this.auth.session?.()]); }

  open(record: FlockCollection, trigger: HTMLElement | null = null): void {
    if (this.saving()) return;
    this.owner = this.identity(); this.trigger = trigger; this.opened = true;
    this.record.set(record); this.mode.set('detail'); this.error.set(''); this.fieldErrors.set({}); this.blocked.set(false);
    this.dialog().nativeElement.showModal(); this.dialog().nativeElement.scrollTop = 0;
    this.heading().nativeElement.focus({ preventScroll: true }); this.loadRecord();
  }
  loadRecord(): void {
    const record = this.record(); if (!record || !this.opened || this.saving()) return;
    const version = ++this.version;
    this.loading.set(true); this.loadError.set(false);
    this.api.collection(record.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (fresh) => {
        if (version !== this.version || this.owner !== this.identity()) return;
        if (fresh.flock_id !== this.flock().id) { this.loadError.set(true); this.loading.set(false); return; }
        this.record.set(fresh); this.loading.set(false); this.blocked.set(false);
      },
      error: () => { if (version === this.version) { this.loadError.set(true); this.loading.set(false); } },
    });
  }
  start(mode: 'edit' | 'delete'): void {
    const record = this.record();
    if (!record || !this.canChange() || this.owner !== this.identity()) return;
    this.form.reset({ quantity: record.quantity, occurredAt: collectionLocalDateTime(record.occurred_at), notes: record.notes ?? '', reason: '' });
    this.maximumTime.set(collectionLocalDateTime(new Date().toISOString()));
    this.error.set(''); this.fieldErrors.set({}); this.blocked.set(false); this.mode.set(mode);
    this.dialog().nativeElement.scrollTop = 0; this.heading().nativeElement.focus({ preventScroll: true });
  }
  back(): void {
    if (!this.saving()) {
      this.mode.set('detail'); this.fieldErrors.set({});
      this.heading().nativeElement.focus({ preventScroll: true });
    }
  }
  close(event?: Event): void {
    event?.preventDefault(); if (this.saving()) return;
    this.version++; this.opened = false; this.dialog().nativeElement.close();
    this.loading.set(false); if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true }); this.trigger = null;
  }
  private invalidate(): void {
    this.version++; this.opened = false; this.attempt = null; this.saving.set(false); this.loading.set(false);
    if (this.dialog()?.nativeElement.open) this.dialog().nativeElement.close();
    this.record.set(null); this.trigger = null;
  }
  submit(): void {
    const record = this.record(); const mode = this.mode();
    if (!record || !this.opened || mode === 'detail' || !this.canChange() || this.blocked() || this.owner !== this.identity()) return;
    this.form.markAllAsTouched(); this.error.set(''); this.fieldErrors.set({});
    if (this.form.controls.reason.invalid) return;
    let request: CorrectCollectionRequest | CancelCollectionRequest = { version: record.version, correction_reason: this.form.controls.reason.value.trim() };
    if (mode === 'edit') {
      if (this.form.invalid) return;
      const value = this.form.getRawValue();
      const corrected: CorrectCollectionRequest = { ...request };
      if (value.quantity !== record.quantity) corrected.quantity = value.quantity!;
      const notes = value.notes.trim() || null;
      if (notes !== record.notes) corrected.notes = notes;
      if (value.occurredAt !== collectionLocalDateTime(record.occurred_at)) {
        const time = value.occurredAt + ':00-03:00'; const parsed = new Date(time);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.occurredAt) || !Number.isFinite(parsed.getTime())
          || collectionLocalDateTime(parsed.toISOString()) !== value.occurredAt || parsed > new Date() || parsed < new Date(this.flock().established_at)) {
          this.fieldErrors.set({ occurred_at: 'La fecha debe pertenecer a la existencia del lote y no ser futura.' }); return;
        }
        corrected.occurred_at = time;
      }
      if (Object.keys(corrected).length === 2) { this.error.set('Modificá al menos un dato de la postura.'); return; }
      request = corrected;
    }
    const fingerprint = JSON.stringify([this.owner, record.id, mode, request]);
    if (this.attempt?.fingerprint !== fingerprint) this.attempt = { fingerprint, key: crypto.randomUUID() };
    const version = this.version;
    this.saving.set(true);
    const operation = mode === 'edit' ? this.api.correct(record.id, request, this.attempt.key) : this.api.cancel(record.id, request, this.attempt.key);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (version !== this.version || this.owner !== this.identity()) return;
        this.record.set(response.collection); this.saving.set(false); this.attempt = null; this.mode.set('detail');
        this.changed.emit(mode === 'edit' ? 'edited' : 'deleted');
        this.heading().nativeElement.focus({ preventScroll: true });
      },
      error: (error: unknown) => {
        if (version !== this.version || this.owner !== this.identity()) return;
        this.saving.set(false);
        const problem: unknown = error instanceof HttpErrorResponse ? error.error : null;
        const body = problem && typeof problem === 'object' ? problem as Record<string, unknown> : {};
        const message = body['detail'] ?? body['message'];
        this.error.set(error instanceof HttpErrorResponse && [409, 422].includes(error.status) && typeof message === 'string' ? message
          : error instanceof HttpErrorResponse && [401, 403].includes(error.status) ? 'No tenés permiso para modificar esta postura.'
          : error instanceof HttpErrorResponse && error.status === 404 ? 'La postura ya no está disponible. Actualizá los registros.'
          : error instanceof HttpErrorResponse && error.status === 0 ? 'Sin conexión. Reintentá con los mismos datos para evitar duplicados.'
          : 'No se pudo guardar. Reintentá con los mismos datos.');
        if (error instanceof HttpErrorResponse) {
          if ([401, 403, 404, 409, 422].includes(error.status)) this.attempt = null;
          if ([401, 403, 404, 409].includes(error.status)) this.blocked.set(true);
          if (error.status === 409 || error.status === 404) { this.mode.set('detail'); this.loadRecord(); this.refreshRequested.emit(); }
          if (error.status === 403) void this.auth.refreshIdentity?.();
          const errors = body['errors'];
          if (errors && typeof errors === 'object') this.fieldErrors.set(Object.fromEntries(
            Object.entries(errors).map(([key, value]) => [key, Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join(' ') : 'Revisá este campo.']),
          ));
        }
      },
    });
  }
}
