import { Component, computed, input } from '@angular/core';
import { addIcons } from 'ionicons';
import { eggOutline, leafOutline, locationOutline } from 'ionicons/icons';
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular';

import { ProductionUnit, PoultryHouse } from '../../interfaces/production-unit.interface';

interface HouseCardPresentation {
  iconName: 'egg-outline' | 'leaf-outline';
  typeLabel: string;
  statusLabel: string;
  metricLabel: string | null;
  occupancyPercent: number | null;
  occupancyLabel: string | null;
  locationLabel: string | null;
}

const birdCountFormatter = new Intl.NumberFormat('es-UY');

@Component({
  selector: 'app-production-unit-house-card',
  templateUrl: './production-unit-house-card.component.html',
  styleUrl: './production-unit-house-card.component.scss',
  imports: [IonCard, IonCardContent, IonIcon],
})
export class ProductionUnitHouseCardComponent {
  readonly house = input.required<PoultryHouse>();
  readonly productionUnit = input<ProductionUnit | null>(null);
  readonly presentation = computed<HouseCardPresentation>(() => {
    const house = this.house();
    const productionUnit = this.productionUnit();
    const occupancy = house.current_occupancy;
    const capacity = house.bird_capacity;
    const hasOccupancy = typeof occupancy === 'number' && Number.isFinite(occupancy) && occupancy >= 0;
    const hasCapacity = typeof capacity === 'number' && Number.isFinite(capacity) && capacity >= 0;
    const canShowProgress = hasOccupancy && typeof capacity === 'number' && capacity > 0;
    const occupancyPercent = canShowProgress && typeof occupancy === 'number' && typeof capacity === 'number'
      ? Math.min(100, (occupancy / capacity) * 100)
      : null;

    let metricLabel: string | null = null;
    if (house.type === 'poultry') {
      if (hasOccupancy && hasCapacity) {
        metricLabel = `${birdCountFormatter.format(occupancy)} aves de ${birdCountFormatter.format(capacity)} plazas`;
      } else if (hasOccupancy) {
        metricLabel = `Ocupación: ${birdCountFormatter.format(occupancy)} aves · capacidad no disponible`;
      } else if (hasCapacity) {
        metricLabel = `Capacidad: ${birdCountFormatter.format(capacity)} aves`;
      } else {
        metricLabel = 'Capacidad no disponible';
      }
    }

    const occupancyLabel = canShowProgress && typeof occupancy === 'number' && typeof capacity === 'number'
      ? `Ocupación: ${birdCountFormatter.format(occupancy)} aves de ${birdCountFormatter.format(capacity)} plazas`
      : null;

    return {
      iconName: house.type === 'feed' ? 'leaf-outline' : 'egg-outline',
      typeLabel: house.type === 'feed' ? 'Planta de ración' : 'Galpón avícola',
      statusLabel: ({
        operational: 'Operativo',
        maintenance: 'Mantenimiento',
        out_of_service: 'Fuera de servicio',
        inactive: 'Inactivo',
      })[house.status],
      metricLabel,
      occupancyPercent,
      occupancyLabel,
      locationLabel: productionUnit
        ? `${productionUnit.locality.name}, ${productionUnit.locality.department.name}`
        : null,
    };
  });

  constructor() {
    addIcons({ eggOutline, leafOutline, locationOutline });
  }
}
