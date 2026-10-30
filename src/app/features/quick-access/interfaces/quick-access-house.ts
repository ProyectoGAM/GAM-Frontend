import { Flock } from '../../flocks/interfaces/flock.interface';
import { PoultryHouse, ProductionUnit } from '../../production-units/interfaces/production-unit.interface';

export interface QuickAccessHouse {
  house: PoultryHouse;
  unit: ProductionUnit;
  flock: Flock | null;
  unavailableReason: string | null;
  searchText: string;
}
