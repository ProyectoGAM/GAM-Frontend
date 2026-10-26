import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, closeOutline, chevronBackOutline, chevronForwardOutline, informationCircleOutline, arrowUndoOutline } from 'ionicons/icons';

import { Flock } from '../../interfaces/flock.interface';
import { FlockMortality, MortalityCancellationSubmission, MortalityDraft, MortalityFieldErrors, MortalitySubmission } from '../../interfaces/flock-mortality.interface';
import { todayInLotsTimezone } from '../../services/flock-detail.service';
import { leadingMortalityReasons, mortalityDate, mortalityDateLabel, mortalityReason, mortalityReasons, mortalitySummary } from '../../services/mortality-summary';
import { MortalityPeriod } from '../../types/mortality-period.type';
import { MortalityLoadState } from '../../types/mortality-state.type';
import { MortalityChartComponent } from '../mortality-chart/mortality-chart.component';

@Component({
  selector: 'app-flock-mortality-section',
  imports: [ReactiveFormsModule, IonIcon, IonSpinner, MortalityChartComponent],
  templateUrl: './flock-mortality-section.component.html',
  styleUrl: './flock-mortality-section.component.scss',
})
export class FlockMortalitySectionComponent {
  readonly flock = input.required<Flock>();
  readonly registrationOnly = input(false);
  readonly formClosed = output<void>();
  readonly houseName = input<string | null>(null);
  readonly unitName = input<string | null>(null);
  readonly records = input<readonly FlockMortality[]>([]);
  readonly state = input<MortalityLoadState>('loading');
  readonly today = input(todayInLotsTimezone());
  readonly retry = output<void>();
  readonly saving = input(false);
  readonly saveError = input<string | null>(null);
  readonly fieldErrors = input<MortalityFieldErrors>({});
  readonly savedSequence = input(0);
  readonly submitted = output<MortalitySubmission>();
  readonly formOpened = output<void>();
  readonly edited = output<void>();
  readonly cancelling = input(false);
  readonly cancellationError = input<string | null>(null);
  readonly cancellationReasonError = input<string | null>(null);
  readonly cancelledSequence = input(0);
  readonly cancellationSubmitted = output<MortalityCancellationSubmission>();
  readonly cancellationOpened = output<void>();
  readonly cancellationEdited = output<void>();
  readonly busy = computed(() => this.saving() || this.cancelling());
  readonly pendingCancellation = signal<{ record: FlockMortality; flockVersion: number } | null>(null);
  readonly cancellationReviewError = signal<string | null>(null);
  readonly cancellationDetails = computed(() => {
    const record = this.pendingCancellation()?.record;
    return record ? { ...record, dateText: mortalityDateLabel(mortalityDate(record)), reason: mortalityReason(record) } : null;
  });
  readonly cancellationNeedsReactivation = computed(() => !!this.pendingCancellation()
    && this.flock().status === 'finished'
    && this.flock().current_quantity + this.pendingCancellation()!.record.quantity > 0);
  readonly cancellationForm = new FormGroup({
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500),
      (control) => String(control.value).trim() ? null : { required: true }] }),
    reactivate: new FormControl(false, { nonNullable: true }),
  });
  readonly pendingConfirmation = signal<{ draft: MortalityDraft; version: number; balance: number } | null>(null);
  readonly confirmationAlive = computed(() => Math.max(0, this.pendingConfirmation()?.balance ?? 0));
  readonly confirmationExcess = computed(() => (this.pendingConfirmation()?.draft.quantity ?? 0) - this.confirmationAlive());
  readonly period = signal<MortalityPeriod>('day');
  readonly selectedKey = signal<string | null>(null);
  readonly historyLimit = signal(20);
  readonly points = computed(() => mortalitySummary(this.records(), this.period(), this.today()));
  readonly windowRecords = computed(() => this.points().flatMap((point) => point.records)
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at) || right.id.localeCompare(left.id)));
  readonly leaders = computed(() => leadingMortalityReasons(this.windowRecords()));
  readonly missingReasons = computed(() => this.windowRecords().filter((record) => !record.notes?.trim())
    .reduce((total, record) => total + record.quantity, 0));
  readonly selected = computed(() => this.points().find((point) => point.key === this.selectedKey())
    ?? [...this.points()].reverse().find((point) => point.quantity > 0) ?? this.points().at(-1)!);
  readonly selectedIndex = computed(() => this.points().findIndex((point) => point.key === this.selected().key));
  readonly selectedReasons = computed(() => mortalityReasons(this.selected().records));
  readonly selectedIds = computed(() => new Set(this.selected().records.map((record) => record.id)));
  readonly history = computed(() => this.windowRecords().slice(0, this.historyLimit()).map((record) => ({
    ...record, dateText: mortalityDateLabel(mortalityDate(record)), reason: mortalityReason(record),
  })));
  readonly periodCaption = computed(() => ({ day: 'Últimos 7 días', week: 'Últimas 8 semanas · lunes a domingo',
    month: 'Últimos 6 meses' })[this.period()] + (this.period() === 'day' ? '' : ' · período actual en curso'));
  readonly windowCaption = computed(() => `${mortalityDateLabel(this.points()[0].key)} – ${mortalityDateLabel(this.today())}`);
  readonly minimumDate = computed(() => [this.flock().entry_date,
    todayInLotsTimezone(new Date(this.flock().established_at))].sort().at(-1)!);
  readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true, validators: [Validators.required, (control) => {
      const value = String(control.value);
      const parsed = new Date(`${value}T00:00:00Z`);
      return !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime())
        || parsed.toISOString().slice(0, 10) !== value || value < this.minimumDate() || value > this.today()
        ? { date: true } : null;
    }] }),
    quantity: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1), Validators.max(2147483647),
      (control) => Number.isInteger(control.value) ? null : { quantity: true }] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000),
      (control) => String(control.value).trim() ? null : { required: true }] }),
  });
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('registrationDialog');
  private readonly confirmationDialog = viewChild<ElementRef<HTMLDialogElement>>('excessDialog');
  private readonly cancellationDialog = viewChild<ElementRef<HTMLDialogElement>>('cancellationDialog');
  private readonly injector = inject(Injector);

  constructor() {
    addIcons({ addOutline, closeOutline, chevronBackOutline, chevronForwardOutline, informationCircleOutline, arrowUndoOutline });
    inject(DestroyRef).onDestroy(() => {
      for (const dialog of [this.confirmationDialog(), this.cancellationDialog(), this.dialog()]) {
        if (dialog?.nativeElement.open) dialog.nativeElement.close();
      }
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.edited.emit());
    this.cancellationForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cancellationEdited.emit());
    effect(() => {
      const dialog = this.dialog();
      if (this.registrationOnly() && dialog) untracked(() => this.openForm());
    });
    effect(() => {
      if (this.savedSequence() > 0) untracked(() => {
        this.dialog()?.nativeElement.close();
        this.confirmationDialog()?.nativeElement.close();
        this.pendingConfirmation.set(null);
        this.form.reset({ date: this.today(), quantity: null, reason: '' });
      });
    });
    effect(() => {
      if (this.cancelledSequence() > 0) untracked(() => {
        this.cancellationDialog()?.nativeElement.close();
        this.pendingCancellation.set(null);
        this.cancellationForm.reset({ reason: '', reactivate: false });
      });
    });
  }

  changePeriod(period: MortalityPeriod): void {
    this.period.set(period);
    this.selectedKey.set(null);
    this.historyLimit.set(20);
  }

  selectPoint(key: string): void {
    this.selectedKey.set(key);
    const index = this.windowRecords().findIndex((record) => this.selected().records.some((item) => item.id === record.id));
    if (index >= this.historyLimit()) this.historyLimit.set(index + this.selected().records.length);
  }

  movePoint(direction: number): void {
    const point = this.points()[this.selectedIndex() + direction];
    if (point) this.selectPoint(point.key);
  }

  openForm(): void {
    if (this.busy() || this.flock().status === 'finished') return;
    this.formOpened.emit();
    this.pendingConfirmation.set(null);
    this.form.reset({ date: this.today(), quantity: null, reason: '' });
    this.dialog()?.nativeElement.showModal();
  }

  closeForm(): void {
    if (this.saving()) return;
    this.dialog()?.nativeElement.close();
    this.formClosed.emit();
  }

  submitForm(): void {
    if (this.busy() || this.flock().status === 'finished') return;
    Object.values(this.form.controls).forEach((control) => control.updateValueAndValidity({ emitEvent: false }));
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const values = this.form.getRawValue();
    const draft: MortalityDraft = { date: values.date, quantity: values.quantity!, reason: values.reason.trim() };
    if (draft.quantity > this.flock().current_quantity) {
      this.pendingConfirmation.set({ draft, version: this.flock().version, balance: this.flock().current_quantity });
      this.confirmationDialog()?.nativeElement.showModal();
      return;
    }
    this.submitted.emit({ draft, excessConfirmation: null });
  }

  confirmExcess(): void {
    const pending = this.pendingConfirmation();
    if (!pending || this.saving()) return;
    this.confirmationDialog()?.nativeElement.close();
    this.pendingConfirmation.set(null);
    if (pending.version !== this.flock().version || pending.balance !== this.flock().current_quantity) {
      this.submitForm();
      return;
    }
    this.submitted.emit({ draft: pending.draft, excessConfirmation: { version: pending.version, balance: pending.balance } });
  }

  cancelExcess(): void {
    if (this.saving()) return;
    this.confirmationDialog()?.nativeElement.close();
    this.pendingConfirmation.set(null);
  }

  onDialogCancel(event: Event): void {
    if (this.saving()) event.preventDefault();
    else this.formClosed.emit();
  }

  openCancellation(record: FlockMortality): void {
    if (this.busy() || record.status !== 'recorded') return;
    this.cancellationOpened.emit();
    this.cancellationReviewError.set(null);
    this.pendingCancellation.set({ record: { ...record }, flockVersion: this.flock().version });
    this.cancellationForm.reset({ reason: '', reactivate: false });
    this.cancellationDialog()?.nativeElement.showModal();
    afterNextRender(() => {
      if (this.cancellationDialog()?.nativeElement.open) {
        this.cancellationDialog()?.nativeElement.querySelector<HTMLButtonElement>('button[autofocus]')?.focus();
      }
    }, { injector: this.injector });
  }

  closeCancellation(): void {
    if (this.cancelling()) return;
    this.cancellationDialog()?.nativeElement.close();
    this.pendingCancellation.set(null);
  }

  onCancellationCancel(event: Event): void {
    if (this.cancelling()) event.preventDefault();
    else this.closeCancellation();
  }

  submitCancellation(): void {
    const pending = this.pendingCancellation();
    if (!pending || this.busy()) return;
    this.cancellationForm.markAllAsTouched();
    if (this.cancellationForm.invalid) return;
    const current = this.records().find((record) => record.id === pending.record.id && record.status === 'recorded');
    if (!current) {
      this.cancellationReviewError.set('Este registro ya no está vigente. Cerrá la confirmación para consultar los datos actualizados.');
      return;
    }
    if (current.version !== pending.record.version || this.flock().version !== pending.flockVersion) {
      this.pendingCancellation.set({ record: { ...current }, flockVersion: this.flock().version });
      this.cancellationForm.controls.reactivate.setValue(false);
      this.cancellationReviewError.set('Los datos cambiaron. Revisá el registro actualizado y confirmá nuevamente.');
      return;
    }
    if (this.cancellationNeedsReactivation() && !this.cancellationForm.controls.reactivate.value) return;
    this.cancellationReviewError.set(null);
    this.cancellationSubmitted.emit({ recordId: current.id, request: {
      version: current.version, flock_version: pending.flockVersion, reason: this.cancellationForm.controls.reason.value.trim(),
      ...(this.cancellationNeedsReactivation() ? { confirm_reactivation: true } : {}),
    } });
  }
}
