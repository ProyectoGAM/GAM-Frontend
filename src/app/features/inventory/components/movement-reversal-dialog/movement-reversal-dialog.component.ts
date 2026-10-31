import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, Injector, ViewChild, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryMovement } from '../../interfaces/inventory';
import { InventoryApi } from '../../services/inventory.api';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { createIdempotencyKey, signedQuantity } from '../../services/inventory-format';

@Component({
  selector: 'app-movement-reversal-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './movement-reversal-dialog.component.html',
  styleUrl: './movement-reversal-dialog.component.scss',
})
export class MovementReversalDialogComponent {
  private readonly api = inject(InventoryApi);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  @ViewChild('dialog', { static: true }) private readonly dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('reasonInput', { static: true }) private readonly reasonInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('heading', { static: true }) private readonly heading!: ElementRef<HTMLHeadingElement>;
  readonly reversed = output<InventoryMovement>();
  readonly failed = output<number>();
  readonly productNames = input<Record<number, string>>({});
  readonly locationNames = input<Record<number, string>>({});
  readonly movement = signal<InventoryMovement | null>(null);
  readonly typeLabel = signal('');
  readonly step = signal<'reason' | 'confirmation'>('reason');
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmedReason = signal('');
  readonly canReverse = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.adjust') === true);
  readonly date = computed(() => {
    const value = this.movement()?.occurred_at;
    return value ? new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
  });
  readonly lines = computed(() => (this.movement()?.lines ?? []).map((line) => ({
    id: line.id, name: line.product?.name ?? this.productNames()[line.product_id] ?? 'Producto sin nombre disponible',
    location: this.locationNames()[line.stock_location_id] ?? 'Ubicación sin nombre disponible', amount: signedQuantity(line.physical_delta, line.unit),
  })));
  readonly form = new FormGroup({ reason: new FormControl('', { nonNullable: true,
    validators: [Validators.maxLength(255), (control) => String(control.value).trim() ? null : { required: true }] }) });
  private trigger: HTMLElement | null = null;
  private version = 0;
  private actorId: number | null = null;
  private sessionContext = '';
  readonly commandBlocked = signal(false);
  private attempt: { fingerprint: string; movementId: number; reason: string; key: string; actorId: number | null } | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.version++;
      if (this.dialog?.nativeElement.open) this.dialog.nativeElement.close();
    });
  }

  open(movement: InventoryMovement, label: string, trigger: HTMLElement | null): void {
    if (!this.canReverse() || this.saving() || this.dialog.nativeElement.open) return;
    this.actorId = this.auth.user()?.id ?? null;
    this.sessionContext = this.identity(); this.commandBlocked.set(false);
    this.trigger = trigger;
    this.movement.set(movement); this.typeLabel.set(label); this.step.set('reason');
    this.error.set(null); this.loadError.set(null); this.confirmedReason.set('');
    this.form.reset({ reason: this.attempt?.movementId === movement.id && this.attempt.actorId === this.actorId ? this.attempt.reason : '' });
    this.dialog.nativeElement.showModal();
    this.focusReason();
    if (movement.lines === undefined) void this.loadDetails();
  }

  async loadDetails(): Promise<void> {
    const movement = this.movement();
    if (!movement || this.saving() || !this.dialog.nativeElement.open) return;
    const version = ++this.version;
    this.loading.set(true); this.loadError.set(null);
    try {
      const response = await firstValueFrom(this.api.movement(movement.id).pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyRef.destroyed || version !== this.version) return;
      this.movement.set(response.data);
    } catch (error) {
      if (this.destroyRef.destroyed || version !== this.version) return;
      this.loadError.set(inventoryErrorMessage(error, 'No se pudo cargar el movimiento para revisar la reversión.'));
    } finally {
      if (!this.destroyRef.destroyed && version === this.version) this.loading.set(false);
    }
  }

  review(): void {
    if (!this.dialog.nativeElement.open || this.saving() || this.loading() || this.loadError() || !this.canReverse()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.reasonInput.nativeElement.focus(); return; }
    this.confirmedReason.set(this.form.controls.reason.value.trim());
    this.error.set(null); this.step.set('confirmation'); this.heading.nativeElement.focus({ preventScroll: true });
  }

  editReason(): void {
    if (this.saving()) return;
    this.step.set('reason'); this.error.set(null); this.focusReason();
  }

  private focusReason(): void {
    afterNextRender(() => {
      if (this.dialog.nativeElement.open && this.step() === 'reason') this.reasonInput.nativeElement.focus();
    }, { injector: this.injector });
  }

  close(): void {
    if (this.saving()) return;
    this.version++; this.loading.set(false);
    if (this.dialog.nativeElement.open) this.dialog.nativeElement.close();
    this.movement.set(null);
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    this.trigger = null;
  }

  onCancel(event: Event): void { event.preventDefault(); this.close(); }

  private identity(): string { return JSON.stringify([this.auth.user(), this.auth.session?.(), this.auth.status?.()]); }

  invalidate(): void {
    this.version++; this.attempt = null; this.commandBlocked.set(true);
    this.saving.set(false); this.close();
  }

  async confirm(): Promise<void> {
    const movement = this.movement(); const reason = this.confirmedReason();
    if (!movement || this.commandBlocked() || !this.dialog.nativeElement.open || this.step() !== 'confirmation' || this.saving()
      || this.loading() || this.loadError() || !this.canReverse() || !reason || reason.length > 255) return;
    if (this.identity() !== this.sessionContext) {
      this.error.set('La sesión cambió. Cerrá el modal y volvé a abrir la reversión.'); return;
    }
    const fingerprint = JSON.stringify([movement.id, reason, this.actorId]);
    if (this.attempt?.fingerprint !== fingerprint) this.attempt = { fingerprint, movementId: movement.id, reason, key: createIdempotencyKey(), actorId: this.actorId };
    const attempt = this.attempt;
    const version = this.version;
    this.saving.set(true); this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.reverse(attempt.movementId, attempt.reason, attempt.key).pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyRef.destroyed || version !== this.version) return;
      this.attempt = null; this.saving.set(false); this.close(); this.form.reset();
      this.reversed.emit(response.data);
    } catch (error) {
      if (this.destroyRef.destroyed || version !== this.version) return;
      this.saving.set(false);
      this.error.set(inventoryErrorMessage(error, 'No se pudo revertir el movimiento. Podés reintentar con los mismos datos.'));
      if (error instanceof HttpErrorResponse && [401, 403, 409, 422].includes(error.status)) this.attempt = null;
      if (error instanceof HttpErrorResponse) {
        if ([401, 403, 409].includes(error.status)) this.commandBlocked.set(true);
        this.failed.emit(error.status);
      }
    }
  }
}
