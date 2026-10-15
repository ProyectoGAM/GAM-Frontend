import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, chevronForwardOutline } from 'ionicons/icons';

import { DetailMetric, FlockHouseOrigin } from '../../interfaces/flock-detail.interface';
import { Flock } from '../../interfaces/flock.interface';
import { formatFlockEntryDate } from '../../services/flock-entry-date';

@Component({
  selector: 'app-flock-card',
  imports: [RouterLink, IonIcon],
  templateUrl: './flock-card.component.html',
  styleUrl: './flock-card.component.scss',
})
export class FlockCardComponent {
  readonly flock = input.required<Pick<Flock, 'id' | 'code' | 'status' | 'is_grouped' | 'entry_date' | 'current_quantity'>>();
  readonly houseName = input<string | null>(null);
  readonly returnHouse = input<FlockHouseOrigin | null>(null);
  readonly originQueryParams = computed(() => {
    const house = this.returnHouse();
    return house ? { lotFrom: 'house', unitId: house.unitId, houseId: house.houseId } : null;
  });
  readonly mortality = input<DetailMetric<number>>({ state: 'loading', value: null });
  readonly detailLink = computed(() => ['/administracion/lotes/lotes', this.flock().id]);
  readonly entryDate = computed(() => formatFlockEntryDate(this.flock().entry_date) ?? 'Fecha no disponible');
  readonly statusLabel = computed(() => ({ active: 'Activo', quarantined: 'En cuarentena', finished: 'Finalizado' })[this.flock().status]);
  readonly liveBirds = computed(() => this.count(Math.max(0, this.flock().current_quantity)));
  readonly negativeBalance = computed(() => this.flock().current_quantity < 0 ? this.count(this.flock().current_quantity) : null);
  readonly mortalityText = computed(() => {
    const metric = this.mortality();
    return metric.state === 'loading' ? 'Cargando…'
      : metric.state === 'unavailable' || metric.value === null ? 'No disponible' : this.count(metric.value);
  });

  constructor() { addIcons({ calendarOutline, chevronForwardOutline }); }

  private count(value: number): string { return new Intl.NumberFormat('es-UY').format(value); }
}
