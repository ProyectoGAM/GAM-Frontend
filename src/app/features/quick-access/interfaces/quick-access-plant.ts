import { PoultryHouse, ProductionUnit } from '../../production-units/interfaces/production-unit.interface';

export interface QuickAccessPlant {
  plant: PoultryHouse;
  unit: ProductionUnit;
  unavailableReason: string | null;
  searchText: string;
}
