import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, checkmarkCircleOutline, closeOutline, medicalOutline, warningOutline } from 'ionicons/icons';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FlockPlan, PlanCatalogOption } from '../../../management-plans/interfaces/management-plan';
import { activityTimingLabel } from '../../../management-plans/services/management-plan-format';
import { HealthApplicationDraft } from '../../interfaces/flock-health.interface';
import { Flock } from '../../interfaces/flock.interface';
import { todayInLotsTimezone } from '../../services/flock-detail.service';
import { healthActivityMatches, healthOccurredAt, healthPlanActivities } from '../../services/flock-health';
import { HealthApplicationKind } from '../../types/flock-health.type';

@Component({
  selector: 'app-health-application',
  imports: [ReactiveFormsModule, IonIcon],
  templateUrl: './health-application.component.html',
  styleUrl: './health-application.component.scss',
})
export class HealthApplicationComponent {
  private readonly auth = inject(AuthStore);
  readonly flock = input.required<Flock>();
  readonly context = input<string | null>(null);
  readonly plan = input<FlockPlan | null>(null);
  readonly vaccines = input<PlanCatalogOption[]>([]);
  readonly medicines = input<PlanCatalogOption[]>([]);
  readonly dataReady = input(false);
  readonly dataError = input<string | null>(null);
  readonly saving = input(false);
  readonly uncertain = input(false);
  readonly error = input<string | null>(null);
  readonly submitted = output<HealthApplicationDraft>();
  readonly retried = output<void>();
  readonly reloadRequested = output<void>();
  readonly closed = output<void>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly confirmation = viewChild.required<ElementRef<HTMLDialogElement>>('confirmation');
  readonly kind = signal<HealthApplicationKind>('vaccination');
  readonly attempted = signal(false);
  readonly localError = signal<string | null>(null);
  readonly locked = computed(() => this.saving() || this.uncertain());
  readonly label = computed(() => this.kind() === 'vaccination' ? 'vacuna' : 'medicamento');
  readonly products = computed(() => this.kind() === 'vaccination' ? this.vaccines() : this.medicines());
  readonly form = new FormGroup({
    product: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    time: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    activity: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    batch: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });
  readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly activities = computed(() => healthPlanActivities(this.plan(), this.kind())
    .map((activity) => ({ ...activity, timing: activityTimingLabel(activity) })));
  readonly selectedActivity = computed(() => this.activities().find((activity) => activity.id === this.value().activity) ?? null);
  readonly withinPlan = computed(() => healthActivityMatches(this.plan(), this.selectedActivity(), this.value().date ?? '', this.value().product ?? ''));
  readonly productName = computed(() => this.products().find((product) => product.value === this.value().product)?.label ?? '');
  readonly planMessage = computed(() => {
    const activity = this.selectedActivity();
    if (!activity) return 'No seleccionaste una actividad del plan. El motivo es obligatorio.';
    const catalogId = activity.catalog_snapshot?.['id'];
    if (!this.value().product) return 'Seleccioná la vacuna o medicamento para comprobar la actividad.';
    if (catalogId != null && String(catalogId) !== this.value().product) return 'La actividad corresponde a otro producto. Esta aplicación quedará fuera del plan y requiere un motivo.';
    return this.withinPlan() ? 'La fecha de aplicación coincide con la actividad seleccionada.'
      : `La fecha no coincide con lo previsto (${activity.timing}). Esta aplicación quedará fuera del plan y requiere un motivo.`;
  });
  readonly responsible = computed(() => this.auth.user()?.name ?? 'Usuario actual');
  readonly maxDate = todayInLotsTimezone;
  readonly minDate = computed(() => this.flock().established_at ? todayInLotsTimezone(new Date(this.flock().established_at)) : this.flock().entry_date);
  private pending: HealthApplicationDraft | null = null;

  constructor() { addIcons({ closeOutline, medicalOutline, warningOutline, calendarOutline, checkmarkCircleOutline }); }

  open(): void {
    this.kind.set('vaccination');
    this.pending = null;
    this.attempted.set(false);
    this.localError.set(null);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    this.form.reset({ date: todayInLotsTimezone(), time });
    this.dialog().nativeElement.showModal();
    this.dialog().nativeElement.querySelector<HTMLElement>('h2')?.focus();
  }

  setKind(kind: HealthApplicationKind): void {
    if (this.locked()) return;
    this.kind.set(kind);
    this.form.patchValue({ product: '', activity: '', batch: '' });
    this.attempted.set(false);
    this.localError.set(null);
  }

  close(event?: Event): void {
    event?.preventDefault();
    if (this.locked()) return;
    this.forceClose();
    this.closed.emit();
  }

  forceClose(): void {
    this.pending = null;
    if (this.confirmation().nativeElement.open) this.confirmation().nativeElement.close();
    if (this.dialog().nativeElement.open) this.dialog().nativeElement.close();
  }

  back(event?: Event): void {
    event?.preventDefault();
    this.pending = null;
    this.confirmation().nativeElement.close();
  }

  submit(): void {
    if (this.saving()) return;
    if (this.uncertain()) { this.retried.emit(); return; }
    if (!this.dataReady() || this.flock().status === 'finished') return;
    this.attempted.set(true);
    this.localError.set(null);
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    const occurredAt = healthOccurredAt(value.date, value.time);
    if (!occurredAt || Date.parse(occurredAt) > Date.now() || Date.parse(occurredAt) < Date.parse(this.flock().established_at)) {
      this.localError.set('La fecha y hora deben estar entre el ingreso del lote y el momento actual.');
      return;
    }
    if (this.form.invalid || !this.products().some((product) => product.value === value.product)
      || (!this.withinPlan() && !value.reason.trim())) {
      this.localError.set('Revisá los campos obligatorios y el motivo de la aplicación fuera del plan.');
      return;
    }
    const body: HealthApplicationDraft['body'] = { occurred_at: occurredAt };
    if (this.kind() === 'vaccination') {
      body.vaccine_id = value.product;
      if (value.batch.trim()) body.vaccine_batch = value.batch.trim();
    } else body.medicine_id = value.product;
    if (value.notes.trim()) body.notes = value.notes.trim();
    if (value.reason.trim()) body.reason = value.reason.trim();
    if (this.withinPlan()) body.plan_activity_id = this.selectedActivity()!.id;
    const draft = { kind: this.kind(), body };
    if (this.withinPlan()) this.submitted.emit(draft);
    else {
      this.pending = draft;
      this.confirmation().nativeElement.showModal();
      this.confirmation().nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }

  confirm(): void {
    if (!this.pending || this.locked()) return;
    const draft = this.pending;
    this.pending = null;
    this.confirmation().nativeElement.close();
    this.submitted.emit(draft);
  }
}
