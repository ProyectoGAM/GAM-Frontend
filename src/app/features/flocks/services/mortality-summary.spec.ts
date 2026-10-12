import { FlockMortality } from '../interfaces/flock-mortality.interface';
import { leadingMortalityReasons, mortalityDate, mortalityReason, mortalitySummary } from './mortality-summary';

const record = (date: string, quantity: number, notes: string | null = 'Golpe de calor'): FlockMortality => ({
  id: `${date}-${quantity}`, version: 1, occurred_at: date, quantity, notes, status: 'recorded',
});

describe('Mortality summaries', () => {
  it('counts dates in Montevideo, fills empty days and excludes cancellations and out-of-window records', () => {
    const records = [record('2026-10-08T02:59:00Z', 3), record('2026-10-08T03:00:00Z', 2),
      { ...record('2026-10-07T15:00:00Z', 20), status: 'cancelled' as const },
      record('2026-09-30T15:00:00Z', 9), record('2026-10-09T15:00:00Z', 40)];
    expect(mortalityDate(records[0])).toBe('2026-10-07');
    const days = mortalitySummary(records, 'day', '2026-10-08');
    expect(days.map((day) => day.key)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
      '2026-10-06', '2026-10-07', '2026-10-08']);
    expect(days.map((day) => day.quantity)).toEqual([0, 0, 0, 0, 0, 3, 2]);
  });

  it('groups calendar weeks starting Monday across a year boundary and marks the current partial week', () => {
    const weeks = mortalitySummary([record('2026-12-27T12:00:00Z', 3), record('2026-12-28T12:00:00Z', 4),
      record('2027-01-01T12:00:00Z', 2)], 'week', '2027-01-01');
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-2)?.quantity).toBe(3);
    expect(weeks.at(-1)).toMatchObject({ key: '2026-12-28', quantity: 6 });
    expect(weeks.at(-1)?.description).toContain('En curso');
  });

  it('groups six calendar months without overflowing on a long month or including future records', () => {
    const months = mortalitySummary([record('2026-12-31T14:00:00Z', 2), record('2027-01-01T14:00:00Z', 3),
      record('2027-02-01T14:00:00Z', 99)], 'month', '2027-01-31');
    expect(months.map((month) => month.key)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01',
      '2026-11-01', '2026-12-01', '2027-01-01']);
    expect(months.map((month) => month.quantity)).toEqual([0, 0, 0, 0, 2, 3]);
  });

  it('ranks deaths rather than records, groups case and spaces, preserves text and shows ties', () => {
    const records = [record('2026-10-01T12:00:00Z', 4, ' Golpe de calor '),
      record('2026-10-02T12:00:00Z', 2, 'GOLPE   DE CALOR'), record('2026-10-03T12:00:00Z', 6, 'Lesión'),
      record('2026-10-03T12:00:00Z', 1, 'Enfermedad'), record('2026-10-04T12:00:00Z', 1, 'Enfermedad'),
      record('2026-10-04T12:00:00Z', 100, null)];
    expect(leadingMortalityReasons(records)).toEqual([{ reason: 'Golpe de calor', quantity: 6 },
      { reason: 'Lesión', quantity: 6 }]);
    expect(leadingMortalityReasons([records.at(-1)!])).toEqual([]);
    expect(mortalityReason(records.at(-1)!)).toContain('Motivo no informado');
  });
});
