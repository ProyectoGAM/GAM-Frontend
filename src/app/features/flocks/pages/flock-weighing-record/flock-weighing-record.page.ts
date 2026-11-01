import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { AuthStore } from '../../../../core/auth/auth.store';

import { DailyWeighingDetail, DailyWeighingEntry } from '../../interfaces/flock-weighing.interface';
import { FlockWeighingsService } from '../../services/flock-weighings.service';

type State = 'loading' | 'ready' | 'not-found' | 'forbidden' | 'offline' | 'error';

const formatGrams = (value: string | null): string => {
  if (value === null) return 'Sin registros';
  return new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(Number(value));
};

@Component({
  selector: 'app-flock-weighing-record-page',
  templateUrl: './flock-weighing-record.page.html',
  styleUrl: './flock-weighing-record.page.scss',
  imports: [RouterLink, IonIcon, IonSpinner, ReactiveFormsModule],
})
export class FlockWeighingRecordPage {
  readonly formatGrams = formatGrams;
  private readonly route = inject(ActivatedRoute);
  private readonly weighings = inject(FlockWeighingsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthStore);
  private readonly deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');
  private readonly deleteHeading = viewChild.required<ElementRef<HTMLHeadingElement>>('deleteHeading');
  private deleteTrigger: HTMLElement | null = null;
  private context = this.identity();
  private attempt: { fingerprint: string; key: string } | null = null;
  private loadVersion = 0;

  readonly state = signal<State>('loading');
  readonly record = signal<DailyWeighingDetail | null>(null);
  readonly entries = signal<DailyWeighingEntry[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loadingMore = signal(false);
  readonly loadMoreError = signal(false);
  readonly flockId = signal('');
  readonly weighingId = signal('');
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('weighings.manage') === true);
  readonly deleting = signal(false);
  readonly deleteTarget = signal<DailyWeighingEntry | null>(null);
  readonly deleteError = signal('');
  readonly deleteBlocked = signal(false);
  readonly success = signal('');
  readonly deleteReason = new FormControl('', { nonNullable: true, validators: [
    Validators.maxLength(1000), (control) => String(control.value).trim().length >= 3 ? null : { required: true },
  ] });
  readonly deleteSummary = computed(() => this.rows().find((row) => row.id === this.deleteTarget()?.id));
  readonly backLink = computed(() => `/administracion/lotes/lotes/${encodeURIComponent(this.flockId())}/pesajes`);
  readonly date = computed(() => {
    const value = this.record()?.date;
    if (!value) return '';
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? 'Fecha no disponible'
      : new Intl.DateTimeFormat('es-UY', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  });
  readonly average = computed(() => formatGrams(this.record()?.average_weight_g ?? null));
  readonly rows = computed(() => this.entries().map((entry) => ({
    id: entry.id,
    time: new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Montevideo' })
      .format(new Date(entry.occurred_at)),
    mode: entry.mode === 'individual' ? 'Individual' : 'Grupal',
    birds: entry.bird_count,
    weight: formatGrams(entry.mode === 'individual' ? entry.weight_g : entry.total_weight_g),
    average: formatGrams(entry.average_weight_g),
    anomalous: entry.outside_expected_range,
  })));

  constructor() {
    addIcons({ arrowBackOutline });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.attempt = null; this.success.set('');
      this.flockId.set(params.get('id') ?? '');
      this.weighingId.set(params.get('weighingId') ?? '');
      this.load();
    });
    effect(() => {
      const context = this.identity();
      untracked(() => {
        if (context !== this.context) {
          this.context = context; this.attempt = null; this.success.set(''); this.load();
        }
      });
    });
    this.destroyRef.onDestroy(() => { this.loadVersion++; this.deleting.set(false); this.closeDelete(undefined, false); });
  }

  private identity(): string { return JSON.stringify([this.auth.user(), this.auth.session?.()]); }

  load(): void {
    const version = ++this.loadVersion;
    this.deleting.set(false); this.closeDelete(undefined, false); this.loadingMore.set(false);
    this.state.set('loading');
    this.record.set(null);
    this.entries.set([]);
    this.nextCursor.set(null);
    this.loadMoreError.set(false);
    if (!this.flockId() || !this.weighingId()) { this.state.set('not-found'); return; }
    this.loadPage(null, version);
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore() || this.deleting()) return;
    this.loadingMore.set(true);
    this.loadMoreError.set(false);
    this.loadPage(cursor, this.loadVersion);
  }

  openDelete(id: string, trigger: HTMLElement): void {
    if (!this.canManage() || this.deleting() || this.loadingMore() || this.state() !== 'ready') return;
    const entry = this.entries().find((item) => item.id === id);
    if (!entry) return;
    this.deleteTarget.set(entry); this.deleteTrigger = trigger;
    this.deleteReason.reset(); this.deleteError.set(''); this.deleteBlocked.set(false);
    this.deleteDialog()!.nativeElement.showModal(); this.deleteHeading().nativeElement.focus({ preventScroll: true });
  }
  closeDelete(event?: Event, refresh = true): void {
    event?.preventDefault(); if (this.deleting()) return;
    const reload = this.deleteBlocked() && !!this.deleteTarget();
    this.deleteDialog()?.nativeElement.close(); this.deleteTarget.set(null);
    if (this.deleteTrigger?.isConnected) this.deleteTrigger.focus({ preventScroll: true });
    this.deleteTrigger = null; this.deleteBlocked.set(false);
    if (reload && refresh && !this.destroyRef.destroyed) this.load();
  }
  confirmDelete(): void {
    const day = this.record(); const entry = this.deleteTarget();
    if (!day || !entry || this.deleting() || this.deleteBlocked() || !this.canManage() || this.identity() !== this.context) return;
    this.deleteReason.markAsTouched();
    if (this.deleteReason.invalid) return;
    const request = { version: day.version, reason: this.deleteReason.value.trim() };
    const fingerprint = JSON.stringify([this.context, day.id, entry.id, request]);
    if (this.attempt?.fingerprint !== fingerprint) this.attempt = { fingerprint, key: crypto.randomUUID() };
    const version = ++this.loadVersion;
    this.loadingMore.set(false); this.deleting.set(true); this.deleteError.set('');
    this.weighings.deleteDailyEntry(day.id, entry.id, request, this.attempt.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (version !== this.loadVersion || this.identity() !== this.context) return;
        this.deleting.set(false); this.attempt = null; this.closeDelete();
        this.success.set('Ingreso de pesaje borrado. La muestra se recalculó y se conservó la auditoría.'); this.load();
      },
      error: (error: unknown) => {
        if (version !== this.loadVersion || this.identity() !== this.context) return;
        this.deleting.set(false);
        const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
        const problem = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const message = problem['detail'] ?? problem['message'];
        this.deleteError.set(error instanceof HttpErrorResponse && [409, 422].includes(error.status) && typeof message === 'string' ? message
          : error instanceof HttpErrorResponse && [401, 403].includes(error.status) ? 'No tenés permiso para borrar este ingreso.'
          : error instanceof HttpErrorResponse && error.status === 404 ? 'El ingreso ya no está disponible. Actualizá el registro.'
          : error instanceof HttpErrorResponse && error.status === 0 ? 'Sin conexión. Reintentá con los mismos datos para evitar duplicados.'
          : 'No se pudo borrar el ingreso. Reintentá con los mismos datos.');
        if (error instanceof HttpErrorResponse) {
          if ([401, 403, 404, 409, 422].includes(error.status)) this.attempt = null;
          if ([401, 403, 404, 409].includes(error.status)) this.deleteBlocked.set(true);
          if (error.status === 403) void this.auth.refreshIdentity?.();
          const errors = problem['errors'];
          if (errors && typeof errors === 'object') {
            const messages = Object.values(errors).flat().filter((value): value is string => typeof value === 'string');
            if (messages.length) this.deleteError.set(messages.join(' '));
          }
        }
      },
    });
  }

  submitDelete(event: Event): void { event.preventDefault(); this.confirmDelete(); }

  private loadPage(cursor: string | null, version: number): void {
    this.weighings.getDaily(this.weighingId(), cursor, 50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (record) => {
        if (version !== this.loadVersion) return;
        if (record.flock_id !== this.flockId()) { this.state.set('not-found'); return; }
        this.record.set(record);
        this.entries.set(cursor ? [...this.entries(), ...record.entries] : record.entries);
        this.nextCursor.set(record.next_cursor);
        this.loadingMore.set(false);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (version !== this.loadVersion) return;
        this.loadingMore.set(false);
        if (cursor) { this.nextCursor.set(cursor); this.loadMoreError.set(true); return; }
        if (error instanceof HttpErrorResponse) {
          if (error.status === 404) { this.state.set('not-found'); return; }
          if (error.status === 401 || error.status === 403) { this.state.set('forbidden'); return; }
          if (error.status === 0) { this.state.set('offline'); return; }
        }
        this.state.set('error');
      },
    });
  }
}
