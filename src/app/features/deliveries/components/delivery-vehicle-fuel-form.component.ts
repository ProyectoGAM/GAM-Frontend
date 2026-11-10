import { Component, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonSpinner } from '@ionic/angular';

@Component({
  selector: 'app-delivery-vehicle-fuel-form',
  templateUrl: './delivery-vehicle-fuel-form.component.html',
  styleUrl: './delivery-vehicle-fuel-form.component.scss',
  imports: [IonSpinner, ReactiveFormsModule],
})
export class DeliveryVehicleFuelFormComponent {
  readonly form = input.required<FormGroup>();
  readonly saving = input(false);
  readonly online = input(false);
  readonly receipt = input<File | null>(null);
  readonly receiptChanged = output<Event>();
  readonly saveRequested = output<void>();
}
