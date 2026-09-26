import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';

import { HouseFlock } from '../../interfaces/production-unit.interface';

@Component({
  selector: 'app-poultry-house-detail-content',
  templateUrl: './poultry-house-detail-content.component.html',
  styleUrl: './poultry-house-detail-content.component.scss',
  imports: [DecimalPipe, IonButton, IonSpinner],
})
export class PoultryHouseDetailContentComponent {
  readonly capacity = input.required<string>();
  readonly occupancy = input.required<string>();
  readonly available = input.required<string>();
  readonly occupancyPercent = input<number | null>(null);
  readonly flocks = input.required<HouseFlock[]>();
  readonly state = input.required<'loading' | 'success' | 'error'>();
  readonly addLot = output<void>();
  readonly retry = output<void>();

  formatCount(value: number): string {
    return new Intl.NumberFormat('es-UY').format(value);
  }
}
