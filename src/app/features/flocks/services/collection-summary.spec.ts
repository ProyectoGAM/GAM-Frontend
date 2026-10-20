import { Flock } from '../interfaces/flock.interface';
import { EggMetricDay } from '../interfaces/flock-detail.interface';
import { buildCollectionRequest, collectionGrouping, collectionLocalDateTime, collectionPeriodAverage, collectionPoints, collectionRange, collectionSummary } from './collection-summary';

const flock = { status: 'active', current_quantity: 100, established_at: '2026-09-01T12:00:00Z' } as Flock;
const now = new Date('2026-10-12T16:00:00Z');
const days = (quantity: number, from: number, to: number): EggMetricDay[] => Array.from({ length: to - from + 1 }, (_, index) => ({ date: `2026-10-${String(from + index).padStart(2, '0')}`, quantity }));

describe('Collection summaries', () => {
  it('excludes the incomplete current day from the average and compares two complete weeks', () => {
    const summary = collectionSummary([...days(100, 1, 4), ...days(200, 5, 11), { date: '2026-10-12', quantity: 20 },
      { date: '2026-09-28', quantity: 100 }, { date: '2026-09-29', quantity: 100 }, { date: '2026-09-30', quantity: 100 }], '2026-09-01', '2026-10-12');
    expect(summary).toMatchObject({ average: 200, trend: 'up', changePercent: 100, total: 2120,
      latestDay: { date: '2026-10-12', quantity: 20 }, averageFrom: '2026-10-05', averageTo: '2026-10-11' });
  });

  it('reports decreasing and unchanged averages using calendar days as the divisor', () => {
    const prior = [{ date: '2026-09-28', quantity: 700 }];
    expect(collectionSummary([...prior, { date: '2026-10-05', quantity: 350 }], '2026-09-01', '2026-10-12'))
      .toMatchObject({ average: 50, trend: 'down', changePercent: -50 });
    expect(collectionSummary([...prior, { date: '2026-10-05', quantity: 700 }], '2026-09-01', '2026-10-12'))
      .toMatchObject({ average: 100, trend: 'stable', changePercent: 0 });
  });

  it('does not fabricate a trend for a new flock or an absent comparison period', () => {
    expect(collectionSummary(days(200, 5, 11), '2026-10-05', '2026-10-12')).toMatchObject({ trend: 'unavailable', changePercent: null });
    expect(collectionSummary([], '2026-09-01', '2026-10-12')).toMatchObject({ latestDay: null, average: null, total: 0, trend: 'unavailable' });
    expect(collectionSummary([{ date: '2026-10-12', quantity: 30 }], '2026-10-12', '2026-10-12')).toMatchObject({ average: null, total: 30 });
  });

  it('starts historical at the first collection and clips recent windows without removing later gaps', () => {
    expect(collectionRange('week', '2026-09-01', '2026-10-12')).toEqual({ from: '2026-10-06', to: '2026-10-12' });
    expect(collectionRange('month', '2026-10-10', '2026-10-12')).toEqual({ from: '2026-10-10', to: '2026-10-12' });
    expect(collectionRange('history', '2024-02-29', '2026-10-12').from).toBe('2024-02-29');
    expect(collectionRange('history', '2026-03-24', '2026-10-13', '2026-08-18'))
      .toEqual({ from: '2026-08-18', to: '2026-10-13' });
    expect(collectionRange('week', '2026-03-24', '2026-10-13', '2026-08-18').from).toBe('2026-10-07');
    expect(collectionRange('month', '2026-03-24', '2026-10-13', '2026-10-10').from).toBe('2026-10-10');
    expect(collectionPoints([{ date: '2026-08-18', quantity: 140 }, { date: '2026-08-20', quantity: 150 }],
      '2026-08-18', '2026-08-20').map((point) => point.quantity)).toEqual([140, null, 150]);
  });

  it('keeps missing days as null, respects real zero and uses the inclusive API average', () => {
    const points = collectionPoints([{ date: '2026-10-10', quantity: 30 }, { date: '2026-10-12', quantity: 0 }], '2026-10-10', '2026-10-12');
    expect(points.map((point) => point.quantity)).toEqual([30, null, 0]);
    expect(collectionPeriodAverage(points)).toBe(10);
    expect(collectionPeriodAverage(collectionPoints([], '2026-10-10', '2026-10-12'))).toBeNull();
  });

  it('shows three calendar months, clamps shorter months and respects the first collection', () => {
    expect(collectionRange('month', '2020-01-01', '2026-10-13')).toEqual({ from: '2026-07-13', to: '2026-10-13' });
    expect(collectionRange('month', '2020-01-01', '2026-01-31').from).toBe('2025-10-31');
    expect(collectionRange('month', '2020-01-01', '2026-05-31').from).toBe('2026-02-28');
    expect(collectionRange('month', '2020-01-01', '2024-05-31').from).toBe('2024-02-29');
    expect(collectionRange('month', '2026-03-24', '2026-10-13', '2026-08-18').from).toBe('2026-08-18');
  });

  it('uses daily, weekly and monthly grouping according to the visible production lifetime', () => {
    expect(collectionGrouping('week', '2026-10-07', '2026-10-13')).toBe('day');
    expect(collectionGrouping('month', '2026-07-13', '2026-10-13')).toBe('week');
    expect(collectionGrouping('history', '2026-08-18', '2026-10-13')).toBe('week');
    expect(collectionGrouping('history', '2024-08-31', '2025-02-28')).toBe('week');
    expect(collectionGrouping('history', '2024-08-31', '2025-03-01')).toBe('month');
    expect(collectionGrouping('history', '2024-02-29', '2024-08-29')).toBe('week');
    expect(collectionGrouping('history', '2024-02-29', '2024-08-30')).toBe('month');
  });

  it('preserves the first day and computes disjoint seven-day means and a weighted overall mean', () => {
    const records = [{ date: '2026-08-18', quantity: 140 },
      ...Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${19 + index}`, quantity: 210 })),
      { date: '2026-08-26', quantity: 300 }, { date: '2026-08-27', quantity: 300 }];
    const points = collectionPoints(records, '2026-08-18', '2026-08-27', 'week', '2026-08-18');
    expect(points.map((point) => [point.from, point.date, point.dayCount, point.quantity])).toEqual([
      ['2026-08-18', '2026-08-18', 1, 140], ['2026-08-19', '2026-08-25', 7, 210], ['2026-08-26', '2026-08-27', 2, 300],
    ]);
    expect(points.reduce((total, point) => total + point.total, 0)).toBe(2210);
    expect(collectionPeriodAverage(points)).toBe(221);
    expect(collectionPeriodAverage(points)).toBe(collectionPeriodAverage(collectionPoints(records, '2026-08-18', '2026-08-27')));
  });

  it('retains empty intervals as gaps and excludes records outside the filtered range', () => {
    const points = collectionPoints([{ date: '2026-08-18', quantity: 140 }, { date: '2026-08-26', quantity: 70 }],
      '2026-08-19', '2026-08-26', 'week', '2026-08-18');
    expect(points.map((point) => point.quantity)).toEqual([null, 70]);
    expect(points.map((point) => point.dayCount)).toEqual([7, 1]);
    expect(collectionPeriodAverage(points)).toBe(70 / 8);
    expect(collectionPoints([], '2026-08-19', '2026-08-26', 'week').every((point) => point.quantity === null)).toBe(true);
  });

  it('uses real calendar month lengths including leap February and the final partial month', () => {
    const points = collectionPoints([{ date: '2024-01-31', quantity: 10 }, { date: '2024-02-29', quantity: 290 },
      { date: '2024-03-02', quantity: 20 }], '2024-01-31', '2024-03-02', 'month', '2024-01-31');
    expect(points.map((point) => [point.from, point.date, point.dayCount, point.quantity])).toEqual([
      ['2024-01-31', '2024-01-31', 1, 10], ['2024-02-01', '2024-02-29', 29, 10], ['2024-03-01', '2024-03-02', 2, 10],
    ]);
    expect(collectionPeriodAverage(points)).toBe(10);
  });
});

describe('Collection requests', () => {
  it('sends only the supported fields and converts farm-local time independently of host timezone', () => {
    expect(buildCollectionRequest(flock, 420, '2026-10-12T12:30', ' Notas ', now))
      .toEqual({ quantity: 420, occurred_at: '2026-10-12T12:30:00-03:00', notes: 'Notas' });
    expect(buildCollectionRequest(flock, 420, '', '', now)).toEqual({ quantity: 420, notes: null });
    expect(collectionLocalDateTime('2026-10-12T02:30:00Z')).toBe('2026-10-11T23:30');
  });

  it('rejects invalid quantities, future and pre-establishment times, and impossible calendar dates', () => {
    for (const quantity of [null, 0, -1, 1.5, 2147483648]) expect(buildCollectionRequest(flock, quantity, '', '', now)).toBeNull();
    for (const date of ['2026-10-12T14:00', '2026-08-31T12:00', '2026-02-30T12:00', '2026-10-12T25:00'])
      expect(buildCollectionRequest(flock, 1, date, '', now)).toBeNull();
    expect(buildCollectionRequest(flock, 1, '', 'a'.repeat(5001), now)).toBeNull();
    expect(buildCollectionRequest({ ...flock, status: 'finished' }, 1, '', '', now)).toBeNull();
    expect(buildCollectionRequest({ ...flock, current_quantity: 0 }, 1, '', '', now)).toBeNull();
  });
});
