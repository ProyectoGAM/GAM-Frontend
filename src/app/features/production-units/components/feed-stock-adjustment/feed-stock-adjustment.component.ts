import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, effect, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedAdjustmentIngredient, FeedAdjustmentResult, PendingFeedAdjustment } from '../../interfaces/feed-adjustment.interface';
import { FeedAdjustmentService } from '../../services/feed-adjustment.service';
import { adjustmentGrams, adjustmentResult } from '../../services/feed-adjustment-quantity';
import { formatFeedKilograms } from '../../services/feed-manufacture-quantity';
import { FeedAdjustmentAction } from '../../types/feed-adjustment-action.type';

@Component({
  selector: 'app-feed-stock-adjustment',
  templateUrl: './feed-stock-adjustment.component.html',
  styleUrl: './feed-stock-adjustment.component.scss',
  imports: [ReactiveFormsModule, IonButton, IonIcon],
})
export class FeedStockAdjustmentComponent implements OnInit {
  private readonly service = inject(FeedAdjustmentService);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly owner = computed(() => `${this.auth.user()?.id ?? 'guest'}:${this.auth.session()?.id ?? 'personal'}`);
  private readonly initialOwner = this.owner();
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  readonly plantId = input.required<number>();
  readonly ingredients = input.required<FeedAdjustmentIngredient[]>();
  readonly operational = input.required<boolean>();
  readonly closed = output<void>();
  readonly saved = output<FeedAdjustmentResult>();
  readonly busyChanged = output<boolean>();
  readonly refreshStock = output<void>();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly pending = signal<PendingFeedAdjustment | null>(null);
  readonly form = new FormGroup({
    productId: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('', { nonNullable: true }),
    action: new FormControl<FeedAdjustmentAction>('sumar', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly selected = computed(() => this.ingredients().find((item) => String(item.id) === this.value().productId) ?? null);
  readonly action = computed(() => this.value().action ?? 'sumar');
  readonly grams = computed(() => adjustmentGrams(this.value().quantity ?? '', this.action()));
  readonly quantityError = computed(() => this.grams() === null
    ? `Ingresá ${this.action() === 'establecer' ? 'cero o una cantidad positiva' : 'una cantidad mayor que cero'}, con hasta 3 decimales (máximo 999.999.999,999 kg).` : null);
  readonly currentLabel = computed(() => formatFeedKilograms(this.selected()?.stockGrams ?? '0'));
  readonly after = computed(() => {
    const selected = this.selected(); const grams = this.grams();
    return selected && grams !== null ? adjustmentResult(selected.stockGrams, grams, this.action()) : null;
  });
  readonly resultError = computed(() => this.selected() && this.grams() !== null && this.after() === null
    ? 'El resultado debe ser mayor o igual a cero y estar dentro del rango permitido de stock.' : null);
  readonly afterLabel = computed(() => formatFeedKilograms(this.after() ?? '0'));
  readonly operationLabel = computed(() => `${({ sumar: '+', restar: '−', establecer: '=' })[this.action()]} ${formatFeedKilograms(this.grams() ?? '0')}`);
  readonly explanation = computed(() => {
    if (this.grams() === null) return 'Seleccioná una operación e ingresá la cantidad en kg.';
    const quantity = formatFeedKilograms(this.grams() ?? '0');
    return ({ sumar: `Se sumarán ${quantity} al stock actual.`, restar: `Se restarán ${quantity} al stock actual.`, establecer: `El stock quedará en ${quantity}.` })[this.action()];
  });
  readonly reasonError = computed(() => {
    const reason = this.value().reason?.trim() ?? '';
    return !reason ? 'Ingresá el motivo del ajuste.' : reason.length > 2000 ? 'El motivo admite hasta 2000 caracteres.' : null;
  });
  readonly identityChanged = computed(() => this.owner() !== this.initialOwner);
  readonly locked = computed(() => this.busy() || this.pending() !== null || this.identityChanged());

  constructor() {
    addIcons({ closeOutline });
    effect(() => {
      if (!this.identityChanged()) return;
      this.service.forgetPending(this.initialOwner, this.plantId());
      this.pending.set(null);
      this.setBusy(false);
      this.closed.emit();
    });
  }

  ngOnInit(): void {
    const pending = this.service.readPending(this.initialOwner, this.plantId());
    if (!pending) return;
    this.pending.set(pending);
    const grams = BigInt(pending.request.valor_g);
    this.form.setValue({ productId: String(pending.productId), action: pending.request.accion,
      quantity: `${grams / 1000n}.${String(grams % 1000n).padStart(3, '0')}`, reason: pending.request.motivo });
  }

  focusTitle(): void { this.title()?.nativeElement.focus(); }

  close(): void { if (!this.busy()) this.closed.emit(); }

  submit(): void {
    if (this.busy() || this.identityChanged()) return;
    this.submitted.set(true);
    let pending = this.pending();
    if (!pending) {
      const product = this.selected(); const grams = this.grams();
      if (!this.operational() || !product || grams === null || this.reasonError() || this.resultError()) return;
      pending = { key: crypto.randomUUID(), productId: product.id,
        request: { accion: this.action(), valor_g: grams, motivo: this.form.controls.reason.value.trim() } };
      this.pending.set(pending);
      this.service.rememberPending(this.initialOwner, this.plantId(), pending);
    }
    this.error.set(null);
    this.setBusy(true);
    this.service.adjust(this.plantId(), pending).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        if (this.identityChanged()) return;
        this.service.forgetPending(this.initialOwner, this.plantId());
        this.pending.set(null);
        this.setBusy(false);
        this.saved.emit(result);
      },
      error: (error: unknown) => {
        if (this.identityChanged()) return;
        this.setBusy(false);
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status >= 400 && status < 500 && status !== 408) {
          this.service.forgetPending(this.initialOwner, this.plantId());
          this.pending.set(null);
        }
        this.error.set(status === 409 ? 'El stock, la planta o el ingrediente cambió. Revisá los datos actualizados antes de aplicar el ajuste.'
          : status === 422 ? 'La API rechazó los datos. Revisá la cantidad, el motivo y el ingrediente.'
            : status === 401 || status === 403 ? 'No tenés acceso para ajustar este stock.'
              : status === 404 ? 'La planta o la materia prima ya no está disponible.'
                : this.pending() ? 'No se pudo confirmar el resultado. Reintentá para consultar o completar el mismo ajuste sin duplicarlo.'
                  : 'No se pudo aplicar el ajuste. Intentá nuevamente.');
        if (status === 409 || status === 404) this.refreshStock.emit();
      },
    });
  }

  private setBusy(busy: boolean): void { this.busy.set(busy); this.busyChanged.emit(busy); }
}
