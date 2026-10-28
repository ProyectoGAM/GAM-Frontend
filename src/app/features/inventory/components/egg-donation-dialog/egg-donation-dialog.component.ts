import { Component, DestroyRef, ElementRef, Injector, ViewChild, afterNextRender, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, eggOutline, warningOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { EggDonationUnit } from '../../interfaces/egg-donation';
import { EggStockApi } from '../../services/egg-stock.api';
import { applyInventoryValidationErrors, inventoryErrorMessage } from '../../services/inventory-errors';
import { createIdempotencyKey, formatQuantity } from '../../services/inventory-format';

function donationDate(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const timestamp = Date.parse(control.value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(control.value) || !Number.isFinite(timestamp)) return { date: true };
  return timestamp > Date.now() ? { future: true } : null;
}

function localNow(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

@Component({
  selector: 'app-egg-donation-dialog',
  imports: [ReactiveFormsModule, IonIcon],
  templateUrl: './egg-donation-dialog.component.html',
  styleUrl: './egg-donation-dialog.component.scss',
  host: {
    '[style.--donation-viewport-height]': 'viewportHeight() + "px"',
    '[style.--donation-viewport-top]': 'viewportTop() + "px"',
  },
})
export class EggDonationDialogComponent {
  private readonly api = inject(EggStockApi);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  readonly productionUnitId = input<number | null>(null);
  readonly saved = output<number>();
  readonly openChanged = output<boolean>();
  readonly unit = signal<EggDonationUnit | null>(null);
  readonly balance = signal<number | null>(null);
  readonly balanceLabel = computed(() => this.balance() === null ? null : formatQuantity(String(this.balance())));
  readonly quantity = signal<number | null>(null);
  readonly quantityLabel = computed(() => this.quantity() === null ? null : formatQuantity(String(this.quantity())));
  readonly result = computed(() => this.balance() !== null && this.quantity() !== null ? this.balance()! - this.quantity()! : null);
  readonly resultLabel = computed(() => this.result() === null ? null : formatQuantity(String(this.result())));
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly viewportHeight = signal(window.innerHeight);
  readonly viewportTop = signal(0);
  readonly form = new FormGroup({
    quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/), Validators.max(2147483647)] }),
    occurred_at: new FormControl('', { nonNullable: true, validators: [Validators.required, donationDate] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });
  @ViewChild('dialog', { static: true }) private readonly dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('body', { static: true }) private readonly body!: ElementRef<HTMLElement>;
  @ViewChild('quantityInput', { static: true }) private readonly quantityInput!: ElementRef<HTMLInputElement>;
  private returnFocusTo: HTMLElement | null = null;
  private intent: { fingerprint: string; key: string } | null = null;
  private epoch = 0;
  private actorId: number | undefined;
  private contextId: number | null | undefined;

  constructor() {
    addIcons({ closeOutline, eggOutline, warningOutline });
    this.form.controls.quantity.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.updateQuantity());
    effect(() => {
      const actor = this.auth.user()?.id;
      const unit = this.productionUnitId();
      if (actor === this.actorId && unit === this.contextId) return;
      this.actorId = actor;
      this.contextId = unit;
      untracked(() => {
        this.epoch++;
        this.busy.set(false);
        this.close();
        this.unit.set(null);
        this.balance.set(null);
        this.form.reset();
        this.quantity.set(null);
        this.intent = null;
        this.error.set(null);
      });
    });
    const viewport = window.visualViewport;
    const update = () => {
      this.viewportHeight.set(viewport && viewport.scale === 1 ? viewport.height : window.innerHeight);
      this.viewportTop.set(viewport && viewport.scale === 1 ? viewport.offsetTop : 0);
    };
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
    this.destroyRef.onDestroy(() => {
      this.epoch++;
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    });
  }

  open(unit: EggDonationUnit, balance: number | null, trigger: HTMLElement): void {
    if (unit.id !== this.productionUnitId() || !this.allowed() || this.busy() || this.dialog.nativeElement.open) return;
    if (unit.id !== this.unit()?.id) {
      this.form.reset({ quantity: '', occurred_at: localNow(), reason: '', notes: '' });
      this.intent = null;
    }
    this.unit.set({ ...unit });
    this.balance.set(balance);
    this.updateQuantity();
    this.error.set(null);
    this.returnFocusTo = trigger;
    this.dialog.nativeElement.showModal();
    this.openChanged.emit(true);
    this.body.nativeElement.scrollTop = 0;
    this.quantityInput.nativeElement.focus();
  }

  close(): void {
    if (this.busy() || !this.dialog?.nativeElement.open) return;
    this.dialog.nativeElement.close();
    this.openChanged.emit(false);
    const trigger = this.returnFocusTo;
    this.returnFocusTo = null;
    afterNextRender(() => {
      if (!this.dialog.nativeElement.open && trigger?.isConnected) trigger.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  cancel(event: Event): void { event.preventDefault(); this.close(); }

  fieldInvalid(control: AbstractControl): boolean { return control.touched && control.invalid; }

  async save(): Promise<void> {
    if (this.busy() || !this.allowed() || !this.unit() || this.unit()!.id !== this.productionUnitId() || !this.dialog.nativeElement.open) return;
    this.form.controls.occurred_at.updateValueAndValidity();
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.focusAfterRender('[aria-invalid="true"]'); return; }
    const unit = this.unit()!;
    const value = this.form.getRawValue();
    const body = {
      quantity: Number(value.quantity), occurred_at: new Date(value.occurred_at).toISOString(),
      reason: value.reason.trim(), notes: value.notes || undefined,
    };
    const fingerprint = JSON.stringify({ unit: unit.id, body });
    if (this.intent?.fingerprint !== fingerprint) this.intent = { fingerprint, key: createIdempotencyKey() };
    const epoch = this.epoch;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.donate(unit.id, body, this.intent!.key));
      if (epoch !== this.epoch || this.destroyRef.destroyed) return;
      this.busy.set(false);
      this.close();
      this.unit.set(null);
      this.balance.set(null);
      this.form.reset();
      this.intent = null;
      this.saved.emit(unit.id);
    } catch (error) {
      if (epoch !== this.epoch || this.destroyRef.destroyed) return;
      this.busy.set(false);
      applyInventoryValidationErrors(this.form, error);
      this.error.set(inventoryErrorMessage(error, 'No se pudo registrar la donación. Puedes reintentar sin duplicarla.'));
      this.focusAfterRender('[aria-invalid="true"], .command-error');
    }
  }

  private allowed(): boolean { return this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.move') === true; }

  private updateQuantity(): void {
    const control = this.form.controls.quantity;
    this.quantity.set(control.valid && control.value ? Number(control.value) : null);
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => {
      const element = this.dialog.nativeElement.querySelector<HTMLElement>(selector);
      element?.focus();
      element?.scrollIntoView?.({ block: 'nearest' });
    }, { injector: this.injector });
  }
}
