import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { formatUyuMoney, parseUyuAmount, uyuDecimal } from '../../../../shared/utils/uyu-money';
import { Customer, CustomerAccountSnapshot, CustomerMovement } from '../../interfaces/customer';
import { PaymentMethod } from '../../types/customer.types';
import { PendingCustomerCommand } from '../../types/customer-command.type';
import { CustomerPendingCommands } from '../../services/customer-pending-commands';
import { CustomersApi } from '../../services/customers.api';
import { customerErrorMessage, hasUncertainCustomerResult } from '../../services/customer-errors';

@Component({
  selector: 'app-customer-account-operation',
  templateUrl: './customer-account-operation.component.html',
  styleUrls: ['../../customers.scss', './customer-account-operation.component.scss'],
  imports: [ReactiveFormsModule],
})
export class CustomerAccountOperationComponent implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly commands = inject(CustomerPendingCommands);
  private readonly initialOwner = this.commands.owner();
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  readonly customer = input.required<Customer>();
  readonly account = input.required<CustomerAccountSnapshot>();
  readonly mode = input<'payment' | 'adjustment' | 'reversal'>('payment');
  readonly movement = input<CustomerMovement | null>(null);
  readonly refreshing = input(false);
  readonly saved = output<void>();
  readonly closed = output<void>();
  readonly busyChanged = output<boolean>();
  readonly refreshAccount = output<void>();
  readonly busy = signal(false);
  readonly pending = signal<PendingCustomerCommand | null>(null);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly form = new FormGroup({
    amount: new FormControl('', { nonNullable: true }),
    direction: new FormControl<'increase' | 'decrease'>('increase', { nonNullable: true }),
    payment_method: new FormControl<PaymentMethod>('cash', { nonNullable: true }),
    payment_reference: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly kind = computed(() => {
    const kind = this.pending()?.kind;
    return kind === 'payment' || kind === 'adjustment' || kind === 'reversal' ? kind : this.mode();
  });
  readonly original = computed(() => { const command = this.pending(); return command?.kind === 'reversal' ? command.movement : this.movement(); });
  readonly title = computed(() => ({ payment: 'Registrar pago', adjustment: 'Ajustar deuda', reversal: 'Revertir movimiento' })[this.kind()]);
  readonly amount = computed(() => this.kind() === 'reversal' ? parseUyuAmount(this.original()?.amount ?? '') : parseUyuAmount(this.value().amount ?? ''));
  readonly amountError = computed(() => this.kind() !== 'reversal' && (this.amount() === null || this.amount()! <= 0n) ? 'Ingresá un importe mayor a cero, con hasta tres decimales.' : null);
  readonly reasonError = computed(() => {
    const reason = this.value().reason?.trim() ?? '';
    return this.kind() !== 'payment' && !reason ? 'Indicá el motivo de la operación.' : reason.length > 2000 ? 'El motivo admite hasta 2000 caracteres.' : null;
  });
  readonly delta = computed(() => {
    const amount = this.amount();
    if (amount === null) return null;
    return this.kind() === 'payment' || this.kind() === 'reversal' || this.value().direction === 'decrease' ? -amount : amount;
  });
  readonly deltaText = computed(() => this.delta() === null ? null : uyuDecimal(this.delta()!));
  readonly after = computed(() => {
    if (this.pending()) return null;
    const before = parseUyuAmount(this.account().balance); const delta = this.delta();
    return before === null || delta === null ? null : uyuDecimal(before + delta);
  });
  readonly locked = computed(() => this.busy() || this.pending() !== null);
  readonly money = formatUyuMoney;

  constructor() {
    effect(() => { if (this.commands.owner() !== this.initialOwner) this.closed.emit(); });
  }

  ngOnInit(): void {
    const command = this.commands.get(this.scope());
    if (command && ['payment', 'adjustment', 'reversal'].includes(command.kind)) {
      this.pending.set(command);
      if (command.kind === 'payment') this.form.patchValue({ ...command.body, payment_reference: command.body.payment_reference ?? '', reason: command.body.reason ?? '' });
      if (command.kind === 'adjustment') this.form.patchValue(command.body);
      if (command.kind === 'reversal') this.form.patchValue({ reason: command.body.reason });
    }
  }

  focusHeading(): void { this.heading()?.nativeElement.focus({ preventScroll: true }); }

  async submit(): Promise<void> {
    if (this.busy() || this.refreshing() || this.commands.owner() !== this.initialOwner) return;
    this.submitted.set(true); this.error.set(null);
    let command = this.pending();
    if (!command) {
      if (this.amountError() || this.reasonError() || this.after() === null || parseUyuAmount(this.after()!) === null) {
        this.error.set(this.amountError() ?? this.reasonError() ?? 'El saldo resultante está fuera del rango permitido.'); return;
      }
      const value = this.form.getRawValue(); const key = crypto.randomUUID();
      if (this.kind() === 'payment') command = { kind: 'payment', key, body: { amount: uyuDecimal(this.amount()!), payment_method: value.payment_method,
        payment_reference: value.payment_reference.trim() || null, reason: value.reason.trim() || null } };
      else if (this.kind() === 'adjustment') command = { kind: 'adjustment', key, body: { amount: uyuDecimal(this.amount()!), direction: value.direction,
        reason: value.reason.trim(), expected_version: this.account().version } };
      else {
        const original = this.original(); if (!original) return;
        command = { kind: 'reversal', key, body: { reason: value.reason.trim(), movementId: original.id }, movement: original };
      }
      this.pending.set(command); this.commands.remember(this.scope(), command);
    }
    if (command.kind !== 'payment' && command.kind !== 'adjustment' && command.kind !== 'reversal') return;
    this.setBusy(true);
    try {
      const request = command.kind === 'payment' ? this.api.pay(this.customer().id, command.body, command.key)
        : command.kind === 'adjustment' ? this.api.adjust(this.customer().id, command.body, command.key)
          : this.api.reverse(this.customer().id, command.body.movementId, command.body.reason, command.key);
      await firstValueFrom(request);
      if (this.destroyRef.destroyed || this.commands.owner() !== this.initialOwner) return;
      this.commands.forget(this.scope()); this.pending.set(null); this.setBusy(false); this.saved.emit();
    } catch (error) {
      if (this.destroyRef.destroyed || this.commands.owner() !== this.initialOwner) return;
      if (!hasUncertainCustomerResult(error)) { this.commands.forget(this.scope()); this.pending.set(null); this.refreshAccount.emit(); }
      this.error.set(customerErrorMessage(error, 'No se pudo registrar la operación.'));
    } finally { if (!this.destroyRef.destroyed) this.setBusy(false); }
  }

  private scope(): string { return `financial:${this.customer().id}`; }
  private setBusy(value: boolean): void { this.busy.set(value); this.busyChanged.emit(value); }
}
