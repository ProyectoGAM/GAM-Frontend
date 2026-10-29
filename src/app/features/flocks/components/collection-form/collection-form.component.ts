import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { Flock } from '../../interfaces/flock.interface';
import { RecordCollectionRequest } from '../../interfaces/flock-collection.interface';
import { buildCollectionRequest, collectionLocalDateTime } from '../../services/collection-summary';

@Component({
  selector: 'app-collection-form',
  imports: [ReactiveFormsModule, IonIcon, IonSpinner],
  templateUrl: './collection-form.component.html',
  styleUrl: './collection-form.component.scss',
})
export class CollectionFormComponent {
  readonly flock = input.required<Flock>();
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  readonly fieldErrors = input<Record<string, string>>({});
  readonly submitted = output<RecordCollectionRequest>();
  readonly reviewError = signal<string | null>(null);
  readonly maximumTime = signal(collectionLocalDateTime(new Date().toISOString()));
  readonly minimumTime = computed(() => collectionLocalDateTime(this.flock().established_at));
  readonly form = new FormGroup({
    quantity: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1), Validators.max(2147483647),
      (control) => Number.isInteger(control.value) ? null : { integer: true }] }),
    occurredAt: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('registrationDialog');

  constructor() { addIcons({ closeOutline }); }

  openForm(): void {
    if (this.saving() || this.flock().status === 'finished' || this.flock().current_quantity <= 0) return;
    this.maximumTime.set(collectionLocalDateTime(new Date().toISOString()));
    this.reviewError.set(null);
    this.dialog()?.nativeElement.showModal();
  }

  close(): void { if (!this.saving()) this.dialog()?.nativeElement.close(); }
  onCancel(event: Event): void { if (this.saving()) event.preventDefault(); }

  saved(): void {
    this.dialog()?.nativeElement.close();
    this.form.reset({ quantity: null, occurredAt: '', notes: '' });
    this.reviewError.set(null);
  }

  submit(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const values = this.form.getRawValue();
    const request = buildCollectionRequest(this.flock(), values.quantity, values.occurredAt, values.notes);
    if (!request) {
      this.reviewError.set('Revisá la fecha y hora: deben pertenecer a la existencia del lote y no ser futuras. El lote debe estar abierto y tener aves vivas.');
      return;
    }
    this.reviewError.set(null);
    this.submitted.emit(request);
  }
}
