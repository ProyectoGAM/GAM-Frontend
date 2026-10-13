import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { FeedSupply } from '../interfaces/feed-supply';
import { FeedSuppliesService } from '../services/feed-supplies.service';

@Component({
  selector: 'app-feed-supplies', imports: [ReactiveFormsModule, RouterLink, DatePipe], templateUrl: './feed-supplies.page.html', styleUrl: './feed-supplies.page.scss',
})
export class FeedSuppliesPage {
  private readonly api = inject(FeedSuppliesService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly flockId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly records = signal<FeedSupply[]>([]);
  readonly products = signal<{ id: number; name: string }[]>([]);
  readonly page = signal(1); readonly lastPage = signal(1); readonly productPage = signal(1); readonly productLastPage = signal(1);
  readonly busy = signal(false); readonly error = signal<string | null>(null); readonly notice = signal<string | null>(null);
  readonly cancelId = signal<string | null>(null);
  readonly cancelReason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] });
  readonly canRecord = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('management-plans.execute') === true);
  readonly form = new FormGroup({ product: new FormControl('', { nonNullable: true, validators: [Validators.required] }), quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(?=.*[1-9])\d{1,12}(?:[.,]\d{1,6})?$/)] }), unit: new FormControl<'kg' | 'g'>('kg', { nonNullable: true }), date: new FormControl('', { nonNullable: true, validators: [Validators.required] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  private epoch = 0; private key: string | null = null; private cancelKey: string | null = null;

  constructor() {
    effect(() => { const actor = this.auth.user()?.id; this.epoch++; this.records.set([]); this.products.set([]); this.key = null; this.cancelId.set(null); if (actor) { void this.load(); void this.loadProducts(); } });
    this.destroyRef.onDestroy(() => this.epoch++);
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { this.key = null; });
  }
  async load(page = 1): Promise<void> {
    const epoch = this.epoch; this.error.set(null);
    try { const result = await firstValueFrom(this.api.list(this.flockId, page)); if (epoch !== this.epoch) return; this.records.set(result.data); this.page.set(result.meta.current_page); this.lastPage.set(result.meta.last_page); }
    catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
  }
  async loadProducts(search = '', page = 1): Promise<void> {
    const epoch = this.epoch;
    try { const result = await firstValueFrom(this.api.products(search, page)); if (epoch !== this.epoch) return; this.products.update((value) => page > 1 ? [...value, ...result.data] : result.data); this.productPage.set(result.meta.current_page); this.productLastPage.set(result.meta.last_page); }
    catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
  }
  searchProducts(event: Event): void { void this.loadProducts((event.target as HTMLInputElement).value); }
  async save(): Promise<void> {
    this.form.markAllAsTouched(); if (this.form.invalid || this.busy()) return;
    const epoch = this.epoch; const data = this.form.getRawValue(); this.busy.set(true); this.error.set(null); this.key ??= crypto.randomUUID();
    try { await firstValueFrom(this.api.record(this.flockId, { product_id: Number(data.product), quantity: data.quantity.replace(',', '.'), unit: data.unit, occurred_at: new Date(data.date).toISOString().replace(/\.\d{3}Z$/, 'Z'), notes: data.notes }, this.key)); if (epoch !== this.epoch) return; this.key = null; this.form.reset({ unit: 'kg' }); this.notice.set('Alimentación registrada.'); await this.load(); }
    catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
    finally { if (epoch === this.epoch) this.busy.set(false); }
  }
  beginCancel(id: string): void { this.cancelId.set(id); this.cancelReason.reset(); this.cancelKey = null; }
  async cancel(): Promise<void> {
    const id = this.cancelId(); if (!id || this.cancelReason.invalid || this.busy()) return;
    const epoch = this.epoch; this.busy.set(true); this.cancelKey ??= crypto.randomUUID();
    try { await firstValueFrom(this.api.cancel(this.flockId, id, this.cancelReason.value, this.cancelKey)); if (epoch !== this.epoch) return; this.cancelId.set(null); this.notice.set('Suministro anulado.'); await this.load(); }
    catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
    finally { if (epoch === this.epoch) this.busy.set(false); }
  }
  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse) { const body = error.error as { message?: string; detail?: string; errors?: Record<string, string[]> }; return Object.values(body?.errors ?? {}).flat().join(' ') || body?.detail || body?.message || 'No se pudo completar la operación.'; }
    return 'No se pudo completar la operación.';
  }
}
