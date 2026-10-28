import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, ViewChild, computed, effect, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { InventoryApi } from '../../services/inventory.api';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { StockBalance, StockLocation, StockRegularizationInput } from '../../interfaces/inventory';
import { createIdempotencyKey, decimalCompare, formatQuantity, isDiscreteUnit } from '../../services/inventory-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { isMovementProductAllowed, stockLocationTypeLabel } from '../../services/movement-product-policy';

@Component({
  selector: 'app-stock-regularization-dialog', imports: [ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './stock-regularization-dialog.component.html', styleUrl: './stock-regularization-dialog.component.scss',
})
export class StockRegularizationDialogComponent {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(InventoryApi);
  private readonly locationsApi = inject(StockLocationsApi);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('dialog', { static: true }) private readonly dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('heading', { static: true }) private readonly heading!: ElementRef<HTMLHeadingElement>;
  readonly regularized = output<void>();
  readonly balance = signal<StockBalance | null>(null);
  readonly locations = signal<StockLocation[]>([]);
  readonly loading = signal(false);
  readonly locationError = signal<string | null>(null);
  readonly destinationState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal<string | null>(null);
  readonly step = signal<'form' | 'confirm'>('form');
  readonly saving = signal(false);
  readonly uncertain = signal(false);
  readonly locked = computed(() => this.saving() || this.uncertain());
  readonly canAdjust = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  readonly canTransfer = computed(() => {
    const balance = this.balance();
    return !!balance && balance.product.kind !== 'medicine' && balance.product.kind !== 'vaccine'
      && balance.product.status === 'active' && balance.product.stock_tracked && decimalCompare(balance.available_quantity, '0') > 0;
  });
  readonly available = computed(() => this.balance() ? formatQuantity(this.balance()!.available_quantity, this.balance()!.product.base_unit) : '');
  readonly discrete = computed(() => isDiscreteUnit(this.balance()?.product.base_unit));
  readonly destinationOptions = computed(() => this.locations().map((location) => ({
    value: location.id, label: location.name, description: `${stockLocationTypeLabel(location)} · ${location.production_unit?.name ?? 'General'}`,
  })));
  readonly form = new FormGroup({
    mode: new FormControl<'trasladar' | 'recontar'>('trasladar', { nonNullable: true }),
    destination: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)] }),
  });
  readonly mode = toSignal(this.form.controls.mode.valueChanges, { initialValue: 'trasladar' as const });
  readonly reviewSummary = signal('');
  private version = 0;
  private destinationVersion = 0;
  private actorId: number | null = null;
  private trigger: HTMLElement | null = null;
  private attempt: { body: StockRegularizationInput; key: string } | null = null;

  constructor() {
    this.form.controls.destination.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => void this.checkDestination());
    effect(() => {
      const actorId = this.auth.user()?.id ?? null;
      const allowed = this.canAdjust();
      if (this.dialog?.nativeElement.open && (actorId !== this.actorId || !allowed)) this.reset();
    });
    this.destroyRef.onDestroy(() => this.reset());
  }

  open(balance: StockBalance, trigger: HTMLElement | null): void {
    if (!this.canAdjust() || this.dialog.nativeElement.open || balance.product.kind === 'egg') return;
    this.actorId = this.auth.user()?.id ?? null; this.trigger = trigger; this.balance.set(balance);
    this.form.reset({ mode: this.canTransfer() ? 'trasladar' : 'recontar', destination: '', quantity: '', reason: '' });
    this.step.set('form'); this.error.set(null); this.uncertain.set(false); this.attempt = null;
    this.destinationState.set('idle'); this.dialog.nativeElement.showModal(); this.heading.nativeElement.focus();
    if (this.canTransfer()) void this.loadDestinations();
  }

  async loadDestinations(): Promise<void> {
    const balance = this.balance(); if (!balance || this.locked()) return;
    const version = ++this.version; this.loading.set(true); this.locationError.set(null); this.locations.set([]);
    try {
      const locations: StockLocation[] = [];
      let lastPage = 1;
      for (let page = 1; page <= lastPage; page++) {
        const response = await firstValueFrom(this.locationsApi.list({ status: 'active', per_page: 100, page }));
        if (version !== this.version || this.destroyRef.destroyed) return;
        locations.push(...response.data); lastPage = response.meta.last_page;
      }
      this.locations.set(locations.filter((location) => location.id !== balance.stock_location_id
        && isMovementProductAllowed({ ...balance.product, available_quantity: balance.available_quantity }, location, 'transfer')));
      await this.checkDestination();
    } catch (error) {
      if (version === this.version && !this.destroyRef.destroyed) this.locationError.set(inventoryErrorMessage(error, 'No se pudieron cargar los destinos.'));
    } finally {
      if (version === this.version && !this.destroyRef.destroyed) this.loading.set(false);
    }
  }

  async checkDestination(): Promise<void> {
    const version = ++this.destinationVersion; const balance = this.balance(); const destination = this.form.controls.destination.value;
    this.destinationState.set('idle');
    if (!balance || !this.locations().some((location) => String(location.id) === destination)) return;
    this.destinationState.set('loading');
    try {
      let lastPage = 1;
      for (let page = 1; page <= lastPage; page++) {
        const response = await firstValueFrom(this.api.allowedProducts({ stock_location_id: Number(destination), operation: 'transfer', per_page: 100, page }));
        if (version !== this.destinationVersion || this.destroyRef.destroyed) return;
        if (response.data.some((product) => product.id === balance.product_id && product.base_unit === balance.product.base_unit)) {
          this.destinationState.set('ready'); return;
        }
        lastPage = response.meta.last_page;
      }
      this.destinationState.set('error');
    } catch {
      if (version === this.destinationVersion && !this.destroyRef.destroyed) this.destinationState.set('error');
    }
  }

  review(): void {
    const balance = this.balance();
    if (!balance || this.locked() || !this.canAdjust()) return;
    this.form.markAllAsTouched(); this.error.set(null);
    if (this.form.controls.reason.invalid) { this.error.set('Escribe un motivo de hasta 255 caracteres.'); return; }
    const value = this.form.getRawValue(); const reason = value.reason.trim();
    if (value.mode === 'trasladar') {
      const quantity = value.quantity.trim().replace(',', '.');
      const valid = this.discrete() ? /^(?=.*[1-9])\d{1,12}$/.test(quantity) : /^(?=.*[1-9])\d{1,12}(?:\.\d{1,6})?$/.test(quantity);
      if (!this.canTransfer() || this.destinationState() !== 'ready' || !valid || decimalCompare(quantity, balance.available_quantity) > 0) {
        this.error.set('Elige un destino compatible verificado y una cantidad positiva que no supere el saldo disponible.'); return;
      }
      this.attempt = { key: createIdempotencyKey(), body: { mode: 'trasladar', reason, quantity, to_stock_location_id: Number(value.destination) } };
      this.reviewSummary.set(`Se trasladarán ${formatQuantity(quantity, balance.product.base_unit)} de ${balance.stock_location.name} a ${this.locations().find((item) => String(item.id) === value.destination)!.name}.`);
    } else if (value.mode === 'recontar') {
      this.attempt = { key: createIdempotencyKey(), body: { mode: 'recontar', reason } };
      this.reviewSummary.set(`El saldo de ${balance.stock_location.name} pasará de ${this.available()} a cero. No se ingresará stock en otra ubicación.`);
    } else return;
    this.step.set('confirm'); this.heading.nativeElement.focus();
  }

  edit(): void { if (!this.locked()) { this.attempt = null; this.step.set('form'); this.error.set(null); } }

  async confirm(): Promise<void> {
    const balance = this.balance(); const attempt = this.attempt;
    if (!balance || !attempt || this.saving() || !this.canAdjust() || this.step() !== 'confirm' || this.actorId !== (this.auth.user()?.id ?? null)) return;
    const version = this.version; this.saving.set(true); this.error.set(null);
    try {
      await firstValueFrom(this.api.regularize(balance.id, attempt.body, attempt.key));
      if (version !== this.version || this.destroyRef.destroyed) return;
      this.reset(); this.regularized.emit();
    } catch (error) {
      if (version !== this.version || this.destroyRef.destroyed) return;
      this.uncertain.set(!(error instanceof HttpErrorResponse) || error.status < 400 || error.status >= 500);
      this.error.set(inventoryErrorMessage(error, 'No se pudo confirmar la regularización.'));
    } finally {
      if (version === this.version && !this.destroyRef.destroyed) this.saving.set(false);
    }
  }

  cancel(event?: Event): void { event?.preventDefault(); if (!this.locked()) this.reset(); }
  private reset(): void {
    this.version++; this.destinationVersion++; this.balance.set(null); this.locations.set([]); this.loading.set(false);
    this.destinationState.set('idle'); this.saving.set(false); this.uncertain.set(false); this.attempt = null;
    if (this.dialog?.nativeElement.open) this.dialog.nativeElement.close();
    if (this.trigger?.isConnected) this.trigger.focus();
  }
}
