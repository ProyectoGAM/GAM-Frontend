import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

import { BreedDraft, BreedReferences, CreateBreed } from '../../interfaces/breed-catalog';
import { BreedWeighingSettings } from '../../interfaces/flock-weighing.interface';
import { breedGrams, breedStages } from '../../services/breed-catalog-presentation';

const stageForm = () => new FormGroup({
  custom: new FormControl(false, { nonNullable: true }),
  min: new FormControl('', { nonNullable: true }),
  max: new FormControl('', { nonNullable: true }),
});

@Component({
  selector: 'app-breed-editor-dialog',
  imports: [ReactiveFormsModule, IonIcon],
  templateUrl: './breed-editor-dialog.component.html',
  styleUrl: './breed-editor-dialog.component.scss',
})
export class BreedEditorDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  readonly references = input.required<BreedReferences>();
  readonly saving = input(false);
  readonly retryOnly = input(false);
  readonly conflict = input(false);
  readonly serverError = input('');
  readonly saveRequested = output<BreedDraft>();

  protected readonly breed = signal<BreedWeighingSettings | null>(null);
  protected readonly stages = breedStages;
  protected readonly error = signal('');
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    status: new FormControl<BreedWeighingSettings['status']>('active', { nonNullable: true }),
    chick: stageForm(),
    adult: stageForm(),
  });

  constructor() { addIcons({ closeOutline }); }

  open(breed: BreedWeighingSettings | null): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) return;
    this.breed.set(breed);
    this.error.set('');
    this.form.reset({ name: breed?.name ?? '', status: breed?.status ?? 'active' });
    for (const { key } of this.stages) {
      const min = breed?.range_overrides[`${key}_min_weight_g`];
      const max = breed?.range_overrides[`${key}_max_weight_g`];
      const effective = breed?.expected_ranges?.[key];
      this.form.controls[key].setValue({
        custom: min != null && max != null,
        min: min ?? effective?.min_weight_g ?? '',
        max: max ?? effective?.max_weight_g ?? '',
      });
    }
    dialog.showModal();
    dialog.scrollTop = 0;
    this.heading().nativeElement.focus({ preventScroll: true });
  }

  close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
  }

  protected cancel(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) this.close();
  }

  protected submit(): void {
    if (this.saving() || this.conflict()) return;
    const draft = this.form.getRawValue();
    const name = draft.name.trim();
    if (!name || name.length > 120) {
      this.showError('Ingresá un nombre de hasta 120 caracteres.', 'breed-name');
      return;
    }

    const values: CreateBreed = { name, status: draft.status };
    for (const { key, label } of this.stages) {
      if (!draft[key].custom) continue;
      const min = breedGrams(draft[key].min);
      const max = breedGrams(draft[key].max);
      if (!min || !max || Number(min) >= Number(max)) {
        this.showError(`${label}. Ingresá un mínimo positivo menor que el máximo. Los gramos admiten un decimal.`,
          `breed-${key}-${min ? 'max' : 'min'}`);
        return;
      }
      values[`${key}_min_weight_g`] = min;
      values[`${key}_max_weight_g`] = max;
    }
    this.error.set('');
    this.saveRequested.emit({ breed: this.breed(), values });
  }

  private showError(message: string, field: string): void {
    this.error.set(message);
    this.dialog().nativeElement.querySelector<HTMLInputElement>(`#${field}`)?.focus();
  }
}
