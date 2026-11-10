import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedBalance, FeedConsumption, FeedCorrectionInput, FeedingRecipeOption, FeedingSubmission } from '../../interfaces/flock-feeding.interface';
import { feedingDate, snapshotRecipeName } from '../../services/feeding-summary';
import { FlockFeedingService } from '../../services/flock-feeding.service';
import { FeedingEditorComponent } from '../feeding-editor/feeding-editor.component';

@Component({
  selector: 'app-feed-consumption-correction',
  imports: [FeedingEditorComponent],
  template: `@if (record(); as item) {
    <app-feeding-editor [open]="isOpen()" [correction]="true" [context]="context()"
      [currentQuantity]="item.cantidad_g" [currentRecipe]="recipeName()" [options]="recipes()"
      [state]="balanceState()" [saving]="saving()" [submitBlocked]="blocked()" [error]="error()"
      (submitted)="save($event)" (closeRequested)="close()" (dismissed)="dismissed()"
      (retry)="loadBalances()" />
  }`,
})
export class FeedConsumptionCorrectionComponent {
  private readonly api = inject(FlockFeedingService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private version = 0;
  private flock = '';
  private owner = '';
  private trigger: HTMLElement | null = null;
  private attempt: { fingerprint: string; key: string } | null = null;
  readonly blocked = signal(false);
  readonly corrected = output<void>();
  readonly closed = output<void>();
  readonly failed = output<number>();
  readonly record = signal<FeedConsumption | null>(null);
  readonly isOpen = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly balances = signal<FeedBalance[]>([]);
  readonly balanceState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly recipeName = computed(() => {
    const record = this.record();
    return this.balances().find((balance) => balance.receta_id === record?.receta_id)?.nombre_receta
      ?? (record ? snapshotRecipeName(record.etapa, record.receta_id) : null) ?? 'Ración sin nombre disponible';
  });
  readonly context = computed(() => this.record() ? `${feedingDate(this.record()!.fecha)} · ${this.recipeName()}` : '');
  readonly recipes = computed<FeedingRecipeOption[]>(() => {
    const record = this.record(); if (!record) return [];
    const options = new Map<number, FeedingRecipeOption>();
    for (const balance of this.balances()) {
      if (balance.up_id === record.up_id) options.set(balance.receta_id, {
        id: balance.receta_id, name: balance.nombre_receta, inactive: balance.estado_receta === 'inactive', balance: balance.saldo_g,
      });
    }
    for (const id of [record.receta_id, record.original.receta_id]) {
      if (!options.has(id)) options.set(id, { id, name: snapshotRecipeName(record.etapa, id) ?? 'Ración histórica', balance: null, inactive: false });
    }
    return [...options.values()];
  });
  constructor() { this.destroyRef.onDestroy(() => this.version++); }

  private identity(): string { return JSON.stringify([this.auth.user(), this.auth.session?.(), this.auth.status?.()]); }

  async open(flock: string, consumption: number, trigger: HTMLElement | null): Promise<void> {
    if (!this.auth.user() || this.saving() || this.isOpen()) return;
    const version = ++this.version; this.flock = flock; this.owner = this.identity(); this.trigger = trigger;
    this.record.set(null); this.balances.set([]); this.error.set(null); this.blocked.set(false);
    const records = await firstValueFrom(this.api.consumptions(flock).pipe(takeUntilDestroyed(this.destroyRef)));
    if (version !== this.version || this.owner !== this.identity()) return;
    const record = records.find((item) => item.id === consumption);
    if (!record) throw new Error('Consumo no disponible');
    this.record.set(record);
    await this.loadBalances();
    if (version === this.version && this.owner === this.identity()) this.isOpen.set(true);
  }
  async loadBalances(): Promise<void> {
    const record = this.record(); if (!record) return;
    const version = this.version; this.balanceState.set('loading');
    try {
      const balances = await firstValueFrom(this.api.balances(record.up_id).pipe(takeUntilDestroyed(this.destroyRef)));
      if (version === this.version) { this.balances.set(balances); this.balanceState.set('ready'); }
    } catch { if (version === this.version) this.balanceState.set('error'); }
  }
  close(): void { if (!this.saving()) this.isOpen.set(false); }
  dismissed(): void {
    this.isOpen.set(false); this.record.set(null);
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    this.trigger = null; this.closed.emit();
  }
  invalidate(): void {
    const wasOpen = this.isOpen();
    this.version++; this.attempt = null; this.isOpen.set(false);
    if (!wasOpen) this.record.set(null);
    this.saving.set(false); this.trigger = null; this.blocked.set(true);
  }
  async save(submission: FeedingSubmission): Promise<void> {
    const record = this.record();
    if (!record || !this.isOpen() || this.saving() || this.blocked() || this.owner !== this.identity() || !this.auth.user()) return;
    const reason = submission.reason.trim();
    if (!reason || reason.length > 2000 || (submission.recipeId === null && submission.grams === null)) return;
    if (submission.grams !== null && !/^\d{1,12}$/.test(submission.grams)) return;
    if (submission.recipeId !== null && !this.recipes().some((recipe) => recipe.id === submission.recipeId)) return;
    const request: FeedCorrectionInput = { motivo: reason,
      ...(submission.recipeId === null ? {} : { receta_id: submission.recipeId }),
      ...(submission.grams === null ? {} : { cantidad_g: submission.grams }),
    };
    const fingerprint = JSON.stringify([this.owner, this.flock, record.id, request]);
    if (this.attempt?.fingerprint !== fingerprint) this.attempt = { fingerprint, key: crypto.randomUUID() };
    const version = this.version; this.saving.set(true); this.error.set(null);
    try {
      await firstValueFrom(this.api.correct(this.flock, record.id, request, this.attempt.key).pipe(takeUntilDestroyed(this.destroyRef)));
      if (version !== this.version) return;
      this.saving.set(false); this.attempt = null; this.isOpen.set(false); this.corrected.emit();
    } catch (error) {
      if (version !== this.version) return;
      this.saving.set(false);
      const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
      const problem = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      const message = problem['detail'] ?? problem['message'];
      this.error.set(typeof message === 'string' ? message : 'No se pudo guardar. Puedes reintentar con los mismos datos.');
      if (error instanceof HttpErrorResponse) {
        if ([401, 403, 409].includes(error.status)) this.blocked.set(true);
        if ([401, 403, 409, 422].includes(error.status)) this.attempt = null;
        this.failed.emit(error.status);
      }
    }
  }
}
