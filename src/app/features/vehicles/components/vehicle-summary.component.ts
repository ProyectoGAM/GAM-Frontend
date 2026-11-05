import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { carOutline } from 'ionicons/icons';

import { Vehicle } from '../interfaces/vehicle';
import { VehicleAvailability } from '../types/vehicle.types';
import { formatVehicleMeasure, vehicleAvailabilityLabel, vehicleStatusLabel } from '../vehicle-format';

@Component({
  selector: 'app-vehicle-summary',
  imports: [IonIcon],
  templateUrl: './vehicle-summary.component.html',
  styleUrl: './vehicle-summary.component.scss',
})
export class VehicleSummaryComponent {
  readonly vehicle = input.required<Vehicle>();
  readonly availability = input<VehicleAvailability>();
  readonly detail = input(false);
  readonly status = computed(() => vehicleStatusLabel(this.vehicle().status));
  readonly availabilityLabel = computed(() => vehicleAvailabilityLabel(this.availability() ?? this.vehicle().availability));
  readonly odometer = computed(() => formatVehicleMeasure(this.vehicle().latest_odometer, 'km') ?? 'Sin lectura registrada');

  constructor() { addIcons({ carOutline }); }
}
