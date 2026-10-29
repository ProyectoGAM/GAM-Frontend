import { PoultryHouse } from '../interfaces/production-unit.interface';

const birdCountFormatter = new Intl.NumberFormat('es-UY');

export function poultryHouseCapacityWarning(house: PoultryHouse | null): string | null {
  if (!house || house.type !== 'poultry') return null;
  const capacity = house.bird_capacity;
  const occupancy = house.current_occupancy;
  if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 0
    || typeof occupancy !== 'number' || !Number.isFinite(occupancy) || occupancy <= capacity) return null;

  return `Hay ${birdCountFormatter.format(occupancy)} aves alojadas y la capacidad es de ${birdCountFormatter.format(capacity)}. Se excede en ${birdCountFormatter.format(occupancy - capacity)} aves.`;
}
