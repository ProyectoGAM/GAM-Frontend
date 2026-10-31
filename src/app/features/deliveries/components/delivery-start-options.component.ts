import { Component, ElementRef, ViewChild, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IonSpinner } from '@ionic/angular';

import { DialogFocusDirective } from '../../../shared/ui/dialog-focus.directive';
import { VehicleOption } from '../../vehicles/interfaces/vehicle';

@Component({
  selector: 'app-delivery-start-options',
  templateUrl: './delivery-start-options.component.html',
  styleUrl: './delivery-start-options.component.scss',
  imports: [DialogFocusDirective, IonSpinner, ReactiveFormsModule],
})
export class DeliveryStartOptionsComponent {
  @ViewChild('noLoadSheet') set noLoadSheet(element: ElementRef<HTMLElement> | undefined) {
    if (element) setTimeout(() => element.nativeElement.focus());
  }

  readonly availableVehicles = input<readonly VehicleOption[]>([]);
  readonly selectedVehicleId = input('');
  readonly warnings = input<readonly string[]>([]);
  readonly startOdometer = input.required<FormControl<string>>();
  readonly online = input(false);
  readonly canOperate = input(false);
  readonly busy = input(false);
  readonly refreshingVehicles = input(false);
  readonly noLoadConfirmation = input(false);
  readonly error = input<string | null>(null);
  readonly selectedVehicleIdChange = output<string>();
  readonly refreshRequested = output<void>();
  readonly noLoadStartRequested = output<void>();
  readonly noLoadStartConfirmed = output<void>();
  readonly noLoadStartCancelled = output<void>();

  selectVehicle(event: Event): void {
    this.selectedVehicleIdChange.emit((event.target as HTMLSelectElement).value);
  }
}
