import { EggMetricDay } from '../interfaces/flock-detail.interface';
import { CollectionPoint, CollectionSummary, RecordCollectionRequest } from '../interfaces/flock-collection.interface';
import { Flock } from '../interfaces/flock.interface';
import { CollectionGrouping, CollectionPeriod } from '../types/collection-period.type';
import { dateBefore } from './flock-detail.service';

const DAY_MS = 86_400_000;
const numberFormat = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const collectionNumber = (value: number): string => numberFormat.format(value);
export const collectionDate = (value: string): string => dateFormat.format(new Date(`${value}T00:00:00Z`));

/** API averages divide by all calendar days, not just days that have a collection. */
export function collectionSummary(days: readonly EggMetricDay[], entryDate: string, today: string): CollectionSummary {
  const valid = days.filter((day) => day.date >= entryDate && day.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const to = dateBefore(today, 1);
  const from = [entryDate, dateBefore(today, 7)].sort().at(-1)!;
  const current = valid.filter((day) => day.date >= from && day.date <= to);
  const count = Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1);
  const average = current.length && count ? Math.round(current.reduce((total, day) => total + day.quantity, 0) / count * 100) / 100 : null;
  const previous = valid.filter((day) => day.date >= dateBefore(today, 14) && day.date < dateBefore(today, 7));
  const previousAverage = Math.round(previous.reduce((total, day) => total + day.quantity, 0) / 7 * 100) / 100;
  const comparable = entryDate <= dateBefore(today, 14) && average !== null && previous.length > 0;
  return {
    latestDay: valid.at(-1) ?? null, total: valid.reduce((total, day) => total + day.quantity, 0), average,
    trend: !comparable ? 'unavailable' : average === previousAverage ? 'stable' : average! > previousAverage ? 'up' : 'down',
    changePercent: comparable && previousAverage > 0 ? Math.round((average! - previousAverage) / previousAverage * 1000) / 10 : null,
    averageFrom: from, averageTo: to,
  };
}

export function collectionRange(period: CollectionPeriod, entryDate: string, today: string, firstCollectionDate: string | null = null): { from: string; to: string } {
  const start = [entryDate, firstCollectionDate ?? entryDate].sort().at(-1)!;
  const windowStart = period === 'week' ? dateBefore(today, 6) : shiftCalendarMonths(today, -3);
  return { from: period === 'history' ? start : [start, windowStart].sort().at(-1)!, to: today };
}

function shiftCalendarMonths(date: string, offset: number): string {
  const start = new Date(`${date}T00:00:00Z`);
  const month = start.getUTCMonth() + offset;
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(start.getUTCFullYear(), month, Math.min(start.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

export function collectionGrouping(period: CollectionPeriod, from: string, to: string): CollectionGrouping {
  if (period === 'week') return 'day';
  if (period === 'month') return 'week';
  const sixMonths = shiftCalendarMonths(from, 6);
  return to > sixMonths ? 'month' : 'week';
}

/** Intervals are disjoint. Keep the first collection day as the original green reference. */
export function collectionPoints(days: readonly EggMetricDay[], from: string, to: string,
  grouping: CollectionGrouping = 'day', firstHistoricalDate: string | null = null): CollectionPoint[] {
  const quantities = new Map(days.map((day) => [day.date, day.quantity]));
  const points: CollectionPoint[] = [];
  const addPoint = (start: string, end: string): void => {
    const dayCount = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS + 1;
    let total = 0;
    let hasRecords = false;
    for (let index = 0; index < dayCount; index++) {
      const quantity = quantities.get(dateBefore(start, -index));
      if (quantity !== undefined) { hasRecords = true; total += quantity; }
    }
    points.push({ date: end, from: start, dayCount, total, quantity: hasRecords ? total / dayCount : null,
      label: start === end ? collectionDate(end) : `${collectionDate(start)} – ${collectionDate(end)}` });
  };
  let cursor = from;
  if (grouping !== 'day' && from === firstHistoricalDate && from <= to && quantities.has(from)) {
    addPoint(from, from);
    cursor = dateBefore(from, -1);
  }
  while (cursor <= to) {
    let end = cursor;
    if (grouping === 'week') end = dateBefore(cursor, -6);
    if (grouping === 'month') {
      const start = new Date(`${cursor}T00:00:00Z`);
      end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    }
    end = end > to ? to : end;
    addPoint(cursor, end);
    cursor = dateBefore(end, -1);
  }
  return points;
}

export function collectionPeriodAverage(points: readonly CollectionPoint[]): number | null {
  return points.some((point) => point.quantity !== null)
    ? points.reduce((total, point) => total + point.total, 0) / points.reduce((total, point) => total + point.dayCount, 0) : null;
}

export function collectionTrendText(summary: CollectionSummary): string {
  const label = { up: '↑', down: '↓', stable: '→', unavailable: 'Sin comparación disponible' }[summary.trend];
  return summary.changePercent === null ? label : `${label} ${collectionNumber(Math.abs(summary.changePercent))} %`;
}

export function collectionLocalDateTime(instant: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function buildCollectionRequest(flock: Flock, quantity: number | null, localTime: string, notes: string, now = new Date()): RecordCollectionRequest | null {
  if (flock.status === 'finished' || flock.current_quantity <= 0 || !Number.isInteger(quantity)
    || quantity === null || quantity < 1 || quantity > 2147483647 || notes.length > 5000) return null;
  let occurredAt: string | undefined;
  if (localTime) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime)) return null;
    occurredAt = `${localTime}:00-03:00`;
    const parsed = new Date(occurredAt);
    if (!Number.isFinite(parsed.getTime()) || collectionLocalDateTime(parsed.toISOString()) !== localTime
      || parsed > now || parsed < new Date(flock.established_at)) return null;
  }
  return { quantity, ...(occurredAt ? { occurred_at: occurredAt } : {}), notes: notes.trim() || null };
}
