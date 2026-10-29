import { FeedConsumption, FlockFeeding } from '../interfaces/flock-feeding.interface';
import { dailyFeedPoints, feedSummary, formatFeedKg, nextFeedingChange, parseFeedKg, snapshotRecipeName } from './feeding-summary';

const record = (recipe: number, grams: string, date: string): FeedConsumption => ({
  id: 1, fecha: date, up_id: 1, modo: 'manual', receta_id: recipe, cantidad_g: grams,
  original: { receta_id: 99, cantidad_g: '999' }, etapa: { recipe_id: 99, recipe_snapshot: { name: 'Anterior' } },
});

describe('feeding quantities and summaries', () => {
  it('forecasts the nearest future copied stage using one-based feeding age, also in manual mode', () => {
    const current = { edad_dias: 10, modo: 'manual', finalizado: false } as FlockFeeding;
    const stages = [15, 1, 10, 12].map((day) => ({ start_day: day, recipe_id: 1, recipe_snapshot: {} }));
    expect(nextFeedingChange(current, stages, '2026-12-31')).toEqual({ date: '2027-01-02', day: 12 });
    expect(nextFeedingChange({ ...current, edad_dias: 15 }, stages, '2026-12-31')).toBeNull();
    expect(nextFeedingChange({ ...current, finalizado: true }, stages, '2026-12-31')).toBeNull();
    expect(nextFeedingChange(current, [], '2026-12-31')).toBeNull();
  });
  it('converts kilograms to exact integer grams, allowing zero only for corrections', () => {
    expect(parseFeedKg('12,345', false)).toBe('12345');
    expect(parseFeedKg(' 0.001 ', false)).toBe('1');
    expect(parseFeedKg('999999999,999', false)).toBe('999999999999');
    expect(parseFeedKg('1000000000', false)).toBeNull();
    expect(parseFeedKg('0', false)).toBeNull();
    expect(parseFeedKg('0', true)).toBe('0');
    for (const invalid of ['-1', '0.0001', '1.0000', '1e3', '1.234,5', '', 'NaN']) {
      expect(parseFeedKg(invalid, true)).toBeNull();
    }
  });

  it('sums effective quantities and preserves grams beyond the safe integer range', () => {
    const result = feedSummary([record(2, '9007199254740993', '2026-10-10'), record(2, '7', '2026-10-11'),
      record(1, '0', '2026-10-12')], new Map([[2, 'Ponedoras'], [1, 'Inicio']]));
    expect(result.find((item) => item.recipeId === 2)?.grams).toBe('9007199254741000');
    expect(result.find((item) => item.recipeId === 1)?.grams).toBe('0');
    expect(formatFeedKg('1001')).toBe('1,001');
    expect(formatFeedKg('-1001')).toBe('-1,001');
    expect(formatFeedKg('9007199254740993').endsWith(',993')).toBe(true);
  });

  it('charts one recipe at a time, chronologically, without inventing zeros for absent dates', () => {
    const records = [record(1, '1000', '2026-10-10'), record(2, '2000', '2026-10-11'),
      record(1, '3000', '2026-10-12'), record(1, '999', '2026-10-13')];
    const points = dailyFeedPoints(records, 1, '2026-10-10', '2026-10-12');
    expect(points.map((point) => [point.date, point.grams])).toEqual([['2026-10-10', '1000'], ['2026-10-12', '3000']]);
    expect(dailyFeedPoints(records, 2, null, '2026-10-12').map((point) => point.grams)).toEqual(['2000']);
    expect(dailyFeedPoints(records, null, null, '2026-10-12')).toEqual([]);
  });

  it('does not name a rectified recipe using the original stage snapshot', () => {
    expect(snapshotRecipeName(record(1, '0', '2026-10-12').etapa, 1)).toBeNull();
    expect(snapshotRecipeName({ recipe_id: 1, recipe_snapshot: { name: 'Inicio' } }, 1)).toBe('Inicio');
  });
});
