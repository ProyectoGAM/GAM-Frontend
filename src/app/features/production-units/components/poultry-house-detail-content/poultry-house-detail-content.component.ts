import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { warningOutline } from 'ionicons/icons';

import { HouseFlock } from '../../interfaces/production-unit.interface';
import { FlockCardComponent } from '../../../flocks/components/flock-card/flock-card.component';
import { DetailMetric, FlockHouseOrigin } from '../../../flocks/interfaces/flock-detail.interface';
import { FlockHouseTaskAction } from '../../../flocks/interfaces/flock-house-task.interface';

@Component({
  selector: 'app-poultry-house-detail-content',
  templateUrl: './poultry-house-detail-content.component.html',
  styleUrl: './poultry-house-detail-content.component.scss',
  imports: [DecimalPipe, IonButton, IonIcon, IonSpinner, FlockCardComponent],
})
export class PoultryHouseDetailContentComponent {
  readonly capacity = input.required<string>();
  readonly occupancy = input.required<string>();
  readonly available = input.required<string>();
  readonly occupancyPercent = input<number | null>(null);
  readonly capacityWarning = input<string | null>(null);
  readonly occupancyBarPercent = computed(() => Math.min(100, Math.max(0, this.occupancyPercent() ?? 0)));
  readonly flocks = input.required<HouseFlock[]>();
  readonly returnHouse = input<FlockHouseOrigin | null>(null);
  readonly mortalities = input<ReadonlyMap<string, DetailMetric<number>>>(new Map());
  readonly state = input.required<'loading' | 'success' | 'error'>();
  readonly canAddLot = input(false);
  readonly addLot = output<void>();
  readonly retry = output<void>();
  readonly taskRequested = output<FlockHouseTaskAction>();

  constructor() {
    addIcons({ warningOutline });
  }
}
