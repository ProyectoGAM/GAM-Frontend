import { afterRenderEffect, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonButton, IonIcon, IonInput, IonModal, IonSelect, IonSelectOption, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, cubeOutline, leafOutline, optionsOutline } from 'ionicons/icons';

import { InventoryIngredient } from '../../interfaces/production-unit.interface';
import { FeedAdjustmentIngredient, FeedAdjustmentResult } from '../../interfaces/feed-adjustment.interface';
import { formatFeedKilograms } from '../../services/feed-manufacture-quantity';
import { FeedStockAdjustmentComponent } from '../feed-stock-adjustment/feed-stock-adjustment.component';

export interface FeedStockRow extends FeedAdjustmentIngredient {
  quantity: string;
  unit: string;
  negative: boolean;
}

@Component({
  selector: 'app-feed-stock-detail',
  templateUrl: './feed-stock-detail.component.html',
  styleUrl: './feed-stock-detail.component.scss',
  imports: [IonButton, IonIcon, IonInput, IonModal, IonSelect, IonSelectOption, IonSpinner, ReactiveFormsModule, FeedStockAdjustmentComponent],
})
export class FeedStockDetailComponent {
  private readonly ingredientTrigger = viewChild<ElementRef<HTMLButtonElement>>('ingredientTrigger');
  private readonly ingredientFormTitle = viewChild<ElementRef<HTMLElement>>('ingredientFormTitle');
  private wasFormOpen = false;
  private readonly adjustmentTrigger = viewChild<ElementRef<HTMLButtonElement>>('adjustmentTrigger');
  private readonly adjustmentForm = viewChild(FeedStockAdjustmentComponent);
  private wasAdjustmentOpen = false;
  readonly plantId = input.required<number>();
  readonly canManufacture = input(false);
  readonly adjustmentOpen = signal(false);
  readonly adjustmentBusy = signal(false);
  readonly adjustmentMessage = signal<string | null>(null);
  readonly adjusted = output<void>();
  readonly manufacture = output<void>();
  readonly rows = input.required<FeedStockRow[]>();
  readonly state = input.required<'loading' | 'success' | 'error'>();
  readonly formOpen = input.required<boolean>();
  readonly form = input.required<FormGroup>();
  readonly ingredients = input.required<InventoryIngredient[]>();
  readonly catalogState = input.required<'idle' | 'loading' | 'success' | 'error'>();
  readonly saving = input.required<boolean>();
  readonly message = input<string | null>(null);
  readonly toggleForm = output<void>();
  readonly saveIngredient = output<void>();
  readonly retry = output<void>();
  readonly retryCatalog = output<void>();

  constructor() {
    addIcons({ closeOutline, cubeOutline, leafOutline, optionsOutline });
    afterRenderEffect(() => {
      const open = this.formOpen();
      if (open === this.wasFormOpen) return;
      this.wasFormOpen = open;
      if (!open) this.ingredientTrigger()?.nativeElement.focus();
    });
    afterRenderEffect(() => {
      const open = this.adjustmentOpen();
      if (open === this.wasAdjustmentOpen) return;
      this.wasAdjustmentOpen = open;
      if (!open) this.adjustmentTrigger()?.nativeElement.focus();
    });
  }

  focusAdjustment(): void { this.adjustmentForm()?.focusTitle(); }

  openIngredientForm(): void {
    if (!this.canManufacture() || this.state() !== 'success' || this.saving()) return;
    this.toggleForm.emit();
  }

  openAdjustment(): void {
    if (!this.canManufacture() || this.state() !== 'success' || this.saving() || this.adjustmentBusy()) return;
    this.adjustmentMessage.set(null);
    this.adjustmentOpen.set(true);
  }

  closeAdjustment(): void { if (!this.adjustmentBusy()) this.adjustmentOpen.set(false); }

  dismissAdjustment(): void {
    this.closeAdjustment();
    this.adjustmentTrigger()?.nativeElement.focus();
  }

  onAdjusted(result: FeedAdjustmentResult): void {
    this.adjustmentMessage.set(`Ajuste registrado. Stock resultante: ${formatFeedKilograms(result.saldo_resultante_g)}.`);
    this.adjustmentOpen.set(false);
    this.adjusted.emit();
  }

  focusForm(): void {
    this.ingredientFormTitle()?.nativeElement.focus();
  }

  closeForm(): void {
    if (this.formOpen() && !this.saving()) this.toggleForm.emit();
  }
}
