import { Component, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonButton, IonInput, IonSelect, IonSelectOption, IonSpinner } from '@ionic/angular';

export interface FeedStockRow {
  id: number;
  name: string;
  sku: string;
  quantity: string;
  unit: string;
  negative: boolean;
}

@Component({
  selector: 'app-feed-stock-detail',
  templateUrl: './feed-stock-detail.component.html',
  styleUrl: './feed-stock-detail.component.scss',
  imports: [IonButton, IonInput, IonSelect, IonSelectOption, IonSpinner, ReactiveFormsModule],
})
export class FeedStockDetailComponent {
  readonly rows = input.required<FeedStockRow[]>();
  readonly state = input.required<'loading' | 'success' | 'error'>();
  readonly formOpen = input.required<boolean>();
  readonly form = input.required<FormGroup>();
  readonly saving = input.required<boolean>();
  readonly message = input<string | null>(null);
  readonly toggleForm = output<void>();
  readonly saveIngredient = output<void>();
  readonly retry = output<void>();
}
