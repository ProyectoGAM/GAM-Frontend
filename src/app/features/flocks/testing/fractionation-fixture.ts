import { FractionationContext } from '../interfaces/flock-fractionation.interface';
import { Flock } from '../interfaces/flock.interface';

export function fractionationFlock(overrides: Partial<Flock> = {}): Flock {
  return { id: 'source', code: 'L-024', production_unit_id: 7, poultry_house_id: 1, breed_id: 4,
    supplier_id: null, supplier_name: null, origin: null, initial_quantity: 120, current_quantity: 120,
    entry_date: '2026-10-01', established_at: '2026-10-01', age_days: 28, current_week: 5,
    is_grouped: false, status: 'active', version: 2, notes: null, finalized_at: null, finalization_reason: null, ...overrides };
}

export function fractionationFixture(): FractionationContext {
  return {
    source: fractionationFlock(), unitName: 'UP origen',
    houses: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, name: 'Galpón ' + id,
      type: id === 8 ? 'feed' : 'poultry', status: id === 7 ? 'maintenance' : 'operational',
      bird_capacity: 1, current_occupancy: id === 3 ? 777 : 0 })),
    flocks: [fractionationFlock(),
      fractionationFlock({ id: 'finished', poultry_house_id: 3, status: 'finished', current_quantity: 777 }),
      fractionationFlock({ id: 'zero', poultry_house_id: 4, current_quantity: 0 }),
      fractionationFlock({ id: 'receiver', code: 'L-018', poultry_house_id: 5, current_quantity: 300, version: 8 }),
      fractionationFlock({ id: 'other-breed', poultry_house_id: 6, breed_id: 9 }),
      fractionationFlock({ id: 'foreign', poultry_house_id: 5, production_unit_id: 8 }),
    ],
  };
}
