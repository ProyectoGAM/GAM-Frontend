import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, mergeMap, of, toArray } from 'rxjs';
import { FlocksApi } from '../../flocks/services/flocks.api';
import { ProductionUnit } from '../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { QuickAccessHouse } from '../interfaces/quick-access-house';
import { QuickAccessPlant } from '../interfaces/quick-access-plant';

export function quickAccessSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-UY');
}

@Injectable({ providedIn: 'root' })
export class QuickAccessService {
  private readonly units = inject(ProductionUnitsService);
  private readonly flocks = inject(FlocksApi);

  plants(units: readonly ProductionUnit[]): Observable<QuickAccessPlant[]> {
    return from(units.filter((unit) => unit.status === 'active')).pipe(
      mergeMap((unit) => this.units.poultryHouses(unit.id, 'feed').pipe(
        map((plants) => plants.filter((plant) => plant.type === 'feed' && plant.status !== 'inactive')
          .map((plant): QuickAccessPlant => ({ plant, unit,
            unavailableReason: plant.status === 'operational' ? null : 'La planta debe estar operativa para elaborar ración.',
            searchText: quickAccessSearch(`${plant.name} ${unit.name}`),
          }))),
      ), 4),
      toArray(),
      map((groups) => groups.flat().sort((left, right) => left.unit.name.localeCompare(right.unit.name, 'es', { numeric: true })
        || left.plant.name.localeCompare(right.plant.name, 'es', { numeric: true }) || left.plant.id - right.plant.id)),
    );
  }

  houses(units: readonly ProductionUnit[]): Observable<QuickAccessHouse[]> {
    const active = units.filter((unit) => unit.status === 'active');
    if (!active.length) return of([]);
    return from(active).pipe(
      mergeMap((unit) => forkJoin({
        houses: this.units.poultryHouses(unit.id, 'poultry'),
        flocks: this.flocks.list({ production_unit_id: unit.id }),
      }).pipe(map(({ houses, flocks }) => houses
        .filter((house) => house.type === 'poultry' && house.status !== 'inactive')
        .map((house): QuickAccessHouse => {
          const current = flocks.filter((flock) => flock.production_unit_id === unit.id
            && flock.poultry_house_id === house.id && flock.status !== 'finished');
          const flock = current.length === 1 ? current[0] : null;
          const unavailableReason = house.status !== 'operational' ? 'Galpón fuera de operación'
            : current.length > 1 ? 'Hay más de un lote alojado. Revisá la instalación.'
            : !flock ? (house.current_occupancy ? 'No se pudo identificar el lote alojado.' : 'Sin lote activo')
            : null;
          return { house, unit, flock, unavailableReason,
            searchText: quickAccessSearch([house.name, unit.name, ...current.map((item) => item.code)].join(' ')) };
        }))), 4),
      toArray(),
      map((groups) => groups.flat().sort((left, right) => left.unit.name.localeCompare(right.unit.name, 'es', { numeric: true })
        || left.house.name.localeCompare(right.house.name, 'es', { numeric: true }) || left.house.id - right.house.id)),
    );
  }
}
