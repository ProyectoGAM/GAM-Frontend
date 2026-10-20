import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { EggStockTransaction } from '../../interfaces/inventory';
import { EggStockApi } from '../../services/egg-stock.api';
import { inventoryErrorMessage } from '../../services/inventory-errors';

@Component({
  selector: 'app-egg-donations', imports: [ReactiveFormsModule, RouterLink, DatePipe], templateUrl: './egg-donations.page.html', styleUrl: './egg-donations.page.scss',
})
export class EggDonationsPage {
  private readonly api = inject(EggStockApi); private readonly auth = inject(AuthStore); private readonly destroyRef = inject(DestroyRef);
  readonly units = signal<{ id: number; name: string }[]>([]); readonly unit = signal<number | null>(null);
  readonly records = signal<EggStockTransaction[]>([]); readonly page = signal(1); readonly lastPage = signal(1);
  readonly unitPage = signal(1); readonly unitLastPage = signal(1);
  readonly busy = signal(false); readonly error = signal<string | null>(null); readonly notice = signal<string | null>(null);
  readonly canMove = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.move') === true);
  readonly canRead = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.view') === true);
  readonly form = new FormGroup({ quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/), Validators.max(2147483647)] }), date: new FormControl('', { nonNullable: true, validators: [Validators.required] }), reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }), notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }) });
  private epoch = 0; private key: string | null = null;
  constructor() {
    effect(() => { const id = this.auth.user()?.id; this.epoch++; this.records.set([]); this.units.set([]); this.unit.set(null); this.form.reset(); this.key = null; if (id) void this.loadUnits(); });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => { this.key = null; });
    this.destroyRef.onDestroy(() => this.epoch++);
  }
  async loadUnits(search = '', page = 1): Promise<void> {
    const epoch = this.epoch;
    try { const result = await firstValueFrom(this.api.donationUnits(search, page)); if (epoch !== this.epoch) return; this.units.update((value) => page > 1 ? [...value, ...result.data] : result.data); this.unitPage.set(result.meta.current_page); this.unitLastPage.set(result.meta.last_page); if (!this.unit() && result.data[0]) { this.unit.set(result.data[0].id); await this.load(); } }
    catch (error) { if (epoch === this.epoch) this.error.set(inventoryErrorMessage(error)); }
  }
  searchUnits(event: Event): void { void this.loadUnits((event.target as HTMLInputElement).value); }
  selectUnit(event: Event): void { this.unit.set(Number((event.target as HTMLSelectElement).value) || null); this.key = null; this.records.set([]); void this.load(); }
  async load(page = 1): Promise<void> {
    const unit = this.unit(); const epoch = this.epoch; if (!unit || !this.canRead()) return;
    try { const response = await firstValueFrom(this.api.movements(unit, { type: 'donation', page, per_page: 20 })); if (epoch !== this.epoch || unit !== this.unit()) return; this.records.set(response.data); this.page.set(response.meta.current_page); this.lastPage.set(response.meta.last_page); }
    catch (error) { if (epoch === this.epoch) this.error.set(inventoryErrorMessage(error)); }
  }
  async save(): Promise<void> {
    this.form.markAllAsTouched(); const unit = this.unit(); if (!unit || this.form.invalid || this.busy()) return;
    const epoch = this.epoch; const value = this.form.getRawValue(); this.key ??= crypto.randomUUID(); this.busy.set(true); this.error.set(null);
    try { await firstValueFrom(this.api.donate(unit, { quantity: Number(value.quantity), occurred_at: new Date(value.date).toISOString(), reason: value.reason, notes: value.notes }, this.key)); if (epoch !== this.epoch) return; this.form.reset(); this.key = null; this.notice.set('Donación registrada y descontada del stock.'); await this.load(); }
    catch (error) { if (epoch === this.epoch) this.error.set(inventoryErrorMessage(error)); }
    finally { if (epoch === this.epoch) this.busy.set(false); }
  }
}
