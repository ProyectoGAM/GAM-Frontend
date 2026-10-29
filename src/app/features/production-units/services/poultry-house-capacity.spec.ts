import { poultryHouseCapacityWarning } from './poultry-house-capacity';
import { PoultryHouse } from '../interfaces/production-unit.interface';

describe('Poultry house capacity warning', () => {
  const house: PoultryHouse = { id: 1, name: 'Norte', type: 'poultry', status: 'operational', bird_capacity: 6000, current_occupancy: 6200 };

  it('reports the actual occupancy, capacity and excess', () => {
    expect(poultryHouseCapacityWarning(house)).toBe('Hay 6.200 aves alojadas y la capacidad es de 6.000. Se excede en 200 aves.');
  });

  it.each([0, 5999, 6000])('does not warn for an occupancy of %s within capacity', (current_occupancy) => {
    expect(poultryHouseCapacityWarning({ ...house, current_occupancy })).toBeNull();
  });

  it.each([null, undefined, NaN, Infinity, -1])('does not invent an excess for unknown or invalid occupancy %s', (current_occupancy) => {
    expect(poultryHouseCapacityWarning({ ...house, current_occupancy })).toBeNull();
  });

  it.each([null, NaN, Infinity, -1])('does not invent an excess for unknown or invalid capacity %s', (bird_capacity) => {
    expect(poultryHouseCapacityWarning({ ...house, bird_capacity })).toBeNull();
  });

  it('handles zero capacity and excludes feed plants and missing houses', () => {
    expect(poultryHouseCapacityWarning({ ...house, bird_capacity: 0 })).toContain('Se excede en 6.200 aves.');
    expect(poultryHouseCapacityWarning({ ...house, type: 'feed' })).toBeNull();
    expect(poultryHouseCapacityWarning(null)).toBeNull();
  });
});
