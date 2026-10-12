import { Flock } from '../interfaces/flock.interface';
import { buildMortalityRequest } from './mortality-record-form';

const flock: Flock = { id: 'lot', code: 'L-024', breed_id: 1, supplier_id: null, supplier_name: null,
  origin: null, poultry_house_id: 3, production_unit_id: 1, initial_quantity: 100, current_quantity: -3,
  entry_date: '2026-09-01', established_at: '2026-09-01T12:00:00Z', age_days: 41, current_week: 6,
  is_grouped: false, status: 'active', version: 4, notes: null, finalized_at: null, finalization_reason: null };

describe('Mortality registration payload', () => {
  it('uses the current Montevideo time on the selected day, preserves version and trims the required text', () => {
    expect(buildMortalityRequest(flock, { date: '2026-10-08', quantity: 5, reason: ' Golpe de calor ' },
      new Date('2026-10-12T15:45:59Z'))).toEqual({ version: 4, quantity: 5,
      occurred_at: '2026-10-08T12:45:59-03:00', notes: 'Golpe de calor' });
  });

  it('uses the farm day and time across UTC midnight', () => {
    expect(buildMortalityRequest(flock, { date: '2026-10-11', quantity: 1, reason: 'Lesión' },
      new Date('2026-10-12T02:30:00Z'))?.occurred_at).toBe('2026-10-11T23:30:00-03:00');
    expect(buildMortalityRequest(flock, { date: '2026-10-12', quantity: 1, reason: 'Lesión' },
      new Date('2026-10-12T02:30:00Z'))).toBeNull();
  });

  it.each([0, -1, 1.5, 2147483648])('rejects invalid quantity %s but does not impose a live-balance cap', (quantity) => {
    const now = new Date('2026-10-12T15:45:59Z');
    expect(buildMortalityRequest(flock, { date: '2026-10-12', quantity, reason: 'Lesión' }, now)).toBeNull();
    expect(buildMortalityRequest(flock, { date: '2026-10-12', quantity: 2147483647, reason: 'Lesión' }, now)).not.toBeNull();
  });

  it('rejects missing reasons, impossible dates and finished flocks before HTTP', () => {
    const now = new Date('2026-10-12T15:45:59Z');
    expect(buildMortalityRequest(flock, { date: '2026-10-12', quantity: 1, reason: '   ' }, now)).toBeNull();
    expect(buildMortalityRequest(flock, { date: '2026-09-31', quantity: 1, reason: 'Lesión' }, now)).toBeNull();
    expect(buildMortalityRequest({ ...flock, status: 'finished' }, { date: '2026-10-12', quantity: 1, reason: 'Lesión' }, now)).toBeNull();
  });
});
