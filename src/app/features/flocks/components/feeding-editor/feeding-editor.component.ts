import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosedOutline, warningOutline } from 'ionicons/icons';

import { InfoHelpComponent } from '../../../../shared/components/info-help.component';
import { FeedingRecipeOption, FeedingSubmission } from '../../interfaces/flock-feeding.interface';
import { FeedingLoadState, FeedingMode } from '../../types/feeding-state.type';
import { formatFeedKg, parseFeedKg } from '../../services/feeding-summary';

@Component({
  selector: 'app-feeding-editor',
  templateUrl: './feeding-editor.component.html',
  styleUrl: './feeding-editor.component.scss',
  imports: [ReactiveFormsModule, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonFooter, IonIcon, InfoHelpComponent],
})
export class FeedingEditorComponent {
  readonly open = input(true);
  readonly correction = input(false);
  readonly title = computed(() => this.correction() ? 'Editar consumo' : 'Cambiar ración y cantidad');
  readonly context = input.required<string>();
  readonly currentQuantity = input.required<string>();
  readonly currentRecipe = input('Ración actual');
  readonly currentMode = input<FeedingMode>('manual');
  readonly options = input.required<readonly FeedingRecipeOption[]>();
  readonly state = input.required<FeedingLoadState>();
  readonly saving = input(false);
  readonly submitBlocked = input(false);
  readonly error = input<string | null>(null);
  readonly submitted = output<FeedingSubmission>();
  readonly closeRequested = output<void>();
  readonly dismissed = output<void>();
  readonly retry = output<void>();
  readonly validation = signal('');
  private readonly selectedMode = signal<FeedingMode | null>(null);
  private confirmationDialog: HTMLDialogElement | null = null;
  readonly mode = computed(() => this.selectedMode() ?? this.currentMode());
  readonly automatic = computed(() => !this.correction() && this.mode() === 'automatico');
  readonly unchangedAutomatic = computed(() => this.automatic() && this.currentMode() === 'automatico');
  readonly quantityPlaceholder = computed(() => `Conservar cantidad actual (${formatFeedKg(this.currentQuantity())} kg)`);
  readonly pending = signal<FeedingSubmission | null>(null);
  readonly confirmationRecipe = computed(() => this.options().find((option) => option.id === this.pending()?.recipeId)?.name ?? this.currentRecipe());
  readonly confirmationQuantity = computed(() => formatFeedKg(this.pending()?.grams ?? this.currentQuantity()));
  readonly generalHelp = 'El cambio aplica desde hoy y pasa la alimentación a modo manual. La cantidad diaria queda fija hasta un nuevo cambio; no se ajusta con la edad ni con la cantidad de aves.';
  readonly correctionHelp = 'La edición conserva el registro original. No cambia la alimentación vigente ni el plan del lote.';
  readonly recipeHelp = computed(() => this.correction()
    ? 'Recetas de la UP del registro; se conservan las recetas históricas, incluso inactivas. Conservá la ración actual para modificar únicamente la cantidad.'
    : 'Solo recetas activas con stock positivo en la UP del lote. Conservá la ración actual para modificar únicamente la cantidad.');
  readonly quantityHelp = computed(() => `Ingresá kilogramos con hasta tres decimales. 0,001 kg equivale a 1 g. ${this.correction() ? 'Se permite corregir a cero.' : 'La cantidad diaria debe ser positiva.'} Conservá la cantidad actual para modificar únicamente la ración.`);
  readonly form = new FormGroup({
    recipe: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });
  readonly formatKg = formatFeedKg;

  constructor() {
    addIcons({ lockClosedOutline, warningOutline });
    inject(DestroyRef).onDestroy(() => { if (this.confirmationDialog?.open) this.confirmationDialog.close(); });
  }

  changeMode(mode: FeedingMode): void {
    if (!this.open() || this.saving() || this.submitBlocked() || this.pending()) return;
    this.selectedMode.set(mode); this.validation.set('');
  }

  submit(dialog?: HTMLDialogElement): void {
    if (!this.open() || this.saving() || this.submitBlocked() || this.pending()) return;
    this.validation.set('');
    if (this.automatic()) {
      if (!this.unchangedAutomatic()) this.submitted.emit({ mode: 'automatico', recipeId: null, grams: null, reason: '' });
      return;
    }
    const { recipe, quantity, reason } = this.form.getRawValue();
    const grams = quantity.trim() ? parseFeedKg(quantity, this.correction()) : null;
    const option = this.options().find((item) => item.id === Number(recipe));
    if (recipe && (this.state() !== 'ready' || !option)) {
      this.validation.set('Elegí una receta disponible en la lista.'); return;
    }
    if (quantity.trim() && grams === null) {
      this.validation.set(`Ingresá una cantidad ${this.correction() ? 'mayor o igual a cero' : 'positiva'}, de hasta 999.999.999,999 kg y tres decimales.`); return;
    }
    if (!recipe && grams === null) { this.validation.set('Cambiá la ración o ingresá una cantidad.'); return; }
    if (this.form.invalid || (this.correction() && !reason.trim())) {
      this.validation.set('Escribí el motivo de la edición (hasta 2.000 caracteres).'); return;
    }
    const submission: FeedingSubmission = { recipeId: recipe ? Number(recipe) : null, grams, reason: reason.trim() };
    if (!this.correction()) submission.mode = 'manual';
    if (!this.correction() && this.currentMode() === 'automatico') {
      const fixedGrams = grams ?? (/^[1-9]\d{0,11}$/.test(this.currentQuantity()) ? this.currentQuantity() : null);
      if (fixedGrams === null) { this.validation.set('Ingresá una cantidad diaria positiva para activar el modo manual.'); return; }
      this.pending.set({ ...submission, grams: fixedGrams });
      this.confirmationDialog = dialog ?? null;
      dialog?.showModal();
      return;
    }
    this.submitted.emit(submission);
  }

  cancelConfirmation(event?: Event): void {
    event?.preventDefault(); event?.stopPropagation();
    this.pending.set(null);
    if (this.confirmationDialog?.open) this.confirmationDialog.close();
  }

  confirmManual(): void {
    const submission = this.pending();
    if (!submission || this.saving() || !this.open()) return;
    this.cancelConfirmation();
    this.submitted.emit(submission);
  }
}
