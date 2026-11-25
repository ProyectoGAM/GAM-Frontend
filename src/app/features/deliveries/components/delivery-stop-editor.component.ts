import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { parseUyuAmount, uyuDecimal } from '../../../shared/utils/uyu-money';
import { DeliveriesApi } from '../deliveries.api';
import { createDeliveryId } from '../delivery-id';
import { formatDeliveryMoney } from '../delivery-money';
import type { Delivery, DeliveryPaymentCorrectionInput, DeliveryPaymentInput, DeliveryPaymentMethod, DeliveryStop } from '../delivery.models';
import { collectedForDeliveryStop, paymentsByDeliveryStop } from '../delivery-stop-payments';
import { DeliveryStopCorrectionComponent } from './delivery-stop-correction.component';

type LinkedPaymentFields = Pick<DeliveryPaymentInput, 'amount' | 'payment_method' | 'payment_reference' | 'reason'>;
interface PendingPaymentCorrection {
  paymentId: string;
  key: string;
  body: DeliveryPaymentCorrectionInput;
}

@Component({
  selector: 'app-delivery-stop-editor',
  imports: [DeliveryStopCorrectionComponent],
  templateUrl: './delivery-stop-editor.component.html',
  styleUrl: './delivery-stop-editor.component.scss',
})
export class DeliveryStopEditorComponent implements OnInit {
  readonly delivery = input.required<Delivery>();
  readonly stop = input.required<DeliveryStop>();
  readonly online = input.required<boolean>();
  readonly busy = input(false);
  readonly pendingPayment = input<DeliveryPaymentInput | null>(null);
  readonly cancelled = output<void>();
  readonly refreshed = output<string>();
  readonly paymentRequested = output<LinkedPaymentFields>();

  private readonly api = inject(DeliveriesApi);
  private readonly destroy = inject(DestroyRef);
  private readonly quantitiesForm = viewChild(DeliveryStopCorrectionComponent);
  private pending: PendingPaymentCorrection | null = null;

  protected readonly pane = signal<'quantity' | 'payment'>('quantity');
  protected readonly paymentId = signal('');
  protected readonly paid = signal(true);
  protected readonly amount = signal('');
  protected readonly paymentMethod = signal<DeliveryPaymentMethod>('cash');
  protected readonly reference = signal('');
  protected readonly reason = signal('');
  protected readonly message = signal('');
  protected readonly saving = signal(false);
  protected readonly uncertain = signal(false);
  protected readonly canEditQuantity = computed(() => !!this.stop().version && this.stop().delivered_quantity > 0);
  protected readonly canAddPayment = computed(() => this.stop().accounting_status === 'posted');
  protected readonly payments = computed(() => paymentsByDeliveryStop(this.delivery()).get(this.stop().id) ?? []);
  protected readonly payment = computed(() => this.payments().find((payment) => payment.id === this.paymentId()));
  protected readonly collected = computed(() => uyuDecimal(collectedForDeliveryStop(this.payments())));
  protected readonly money = formatDeliveryMoney;
  readonly locked = computed(() => this.busy() || this.saving() || this.uncertain() || !!this.quantitiesForm()?.locked());

  ngOnInit(): void {
    const pending = this.pendingPayment();
    this.pane.set(this.canEditQuantity() && !pending ? 'quantity' : 'payment');
    this.selectPayment(pending ? '' : this.payments()[0]?.id ?? '');
    if (pending) {
      this.amount.set(pending.amount.replace('.', ','));
      this.paymentMethod.set(pending.payment_method);
      this.reference.set(pending.payment_reference ?? '');
      this.reason.set(pending.reason ?? '');
    }
  }

  protected selectPayment(id: string): void {
    this.paymentId.set(id);
    this.paid.set(true);
    this.amount.set(this.payment()?.amount.replace(/^-/, '').replace('.', ',') ?? '');
    this.reason.set('');
    this.message.set('');
  }

  protected paymentLabel(method: string | null): string {
    const names: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque', other: 'Otro' };
    return names[method ?? ''] ?? 'Medio sin especificar';
  }

  protected selectPaymentMethod(method: string): void {
    if (method === 'cash' || method === 'transfer' || method === 'check' || method === 'other') this.paymentMethod.set(method);
  }

  protected submitPayment(event: Event): void {
    event.preventDefault();
    if (this.busy() || this.saving() || !this.online()) return;
    this.message.set('');
    if (this.uncertain() && this.pending) {
      this.sendCorrection(this.pending);
      return;
    }
    const payment = this.payment();
    if (this.paymentId() && !payment) {
      this.refreshed.emit('El cobro cambió. Revisá el estado actualizado.');
      return;
    }
    const reason = this.reason().trim();
    const amount = this.paid() ? parseUyuAmount(this.amount()) : 0n;
    if (amount === null || (this.paid() && amount <= 0n)) {
      this.message.set('Ingresá un importe mayor a cero, con hasta tres decimales.');
      return;
    }
    if (!payment) {
      if (!this.canAddPayment() || amount <= 0n) return;
      this.paymentRequested.emit({
        amount: uyuDecimal(amount), payment_method: this.paymentMethod(),
        payment_reference: this.reference().trim() || undefined, reason: reason || undefined,
      });
      return;
    }
    if (!reason) {
      this.message.set('Ingresá el motivo de la rectificación del cobro.');
      return;
    }
    if (parseUyuAmount(payment.amount) === -amount) {
      this.message.set('Ingresá un importe distinto al registrado o elegí «No» para dejarlo sin efecto.');
      return;
    }
    const operation = { paymentId: payment.id, key: createDeliveryId(), body: { amount: uyuDecimal(amount), reason } };
    this.pending = operation;
    this.sendCorrection(operation);
  }

  private sendCorrection(operation: PendingPaymentCorrection): void {
    this.saving.set(true);
    this.api.rectifyPayment(this.delivery().id, operation.paymentId, operation.body, operation.key).pipe(
      takeUntilDestroyed(this.destroy), finalize(() => this.saving.set(false)),
    ).subscribe({
      next: () => {
        this.pending = null;
        this.uncertain.set(false);
        this.refreshed.emit(operation.body.amount === '0.000' ? 'Cobro dejado sin efecto.' : 'Cobro rectificado.');
      },
      error: (error: unknown) => {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status === 0 || status === 408 || status >= 500) {
          this.uncertain.set(true);
          this.message.set('No se pudo confirmar el resultado. Reintentá el mismo envío.');
          return;
        }
        this.pending = null;
        this.uncertain.set(false);
        const message = error instanceof HttpErrorResponse ? error.error?.message : undefined;
        if (status === 404 || status === 409) {
          this.refreshed.emit(message || 'El cobro cambió. Revisá el estado actualizado.');
        } else {
          this.message.set(message || 'No se pudo rectificar el cobro. Revisá los datos y volvé a intentar.');
        }
      },
    });
  }
}
