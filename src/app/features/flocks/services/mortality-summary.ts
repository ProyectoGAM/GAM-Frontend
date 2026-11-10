import { FlockMortality, MortalityPoint } from '../interfaces/flock-mortality.interface';
import { MortalityPeriod } from '../types/mortality-period.type';
import { todayInLotsTimezone } from './flock-detail.service';

const DAY_MS = 86_400_000;
const shortDate = new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const monthDate = new Intl.DateTimeFormat('es-UY', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeZone: 'UTC' });

export function mortalityDate(record: FlockMortality): string {
  return todayInLotsTimezone(new Date(record.occurred_at));
}

export function mortalityDateLabel(date: string): string {
  return fullDate.format(new Date(`${date}T00:00:00Z`));
}

export function mortalityReason(record: FlockMortality): string {
  return record.notes?.trim() || 'Motivo no informado en el registro histórico';
}

/** Calendar buckets in the farm timezone; weeks start on Monday, current bucket is partial. */
export function mortalitySummary(records: readonly FlockMortality[], period: MortalityPeriod, today: string, entryDate = today): MortalityPoint[] {
  const current = new Date(`${today}T00:00:00Z`);
  const dated = records.filter((record) => record.status === 'recorded')
    .map((record) => ({ record, date: mortalityDate(record) })).filter(({ date }) => date <= today);
  const weekly = period === 'week';
  if (weekly) current.setUTCDate(current.getUTCDate() - (current.getUTCDay() + 6) % 7);
  else current.setUTCDate(1);

  let first = new Date(current);
  let count = weekly ? 8 : 6;
  let monthsPerPoint = 1;
  if (period === 'historical') {
    const earliest = dated.reduce((date, item) => item.date < date ? item.date : date, entryDate < today ? entryDate : today);
    first = new Date(`${earliest.slice(0, 7)}-01T00:00:00Z`);
    const monthCount = (current.getUTCFullYear() - first.getUTCFullYear()) * 12 + current.getUTCMonth() - first.getUTCMonth() + 1;
    monthsPerPoint = Math.ceil(monthCount / 8);
    count = Math.ceil(monthCount / monthsPerPoint);
  } else if (weekly) {
    first.setUTCDate(first.getUTCDate() - (count - 1) * 7);
  } else {
    first.setUTCMonth(first.getUTCMonth() - (count - 1));
  }
  const starts = Array.from({ length: count + 1 }, (_, index) => {
    const date = new Date(first);
    if (weekly) date.setUTCDate(date.getUTCDate() + index * 7);
    else date.setUTCMonth(date.getUTCMonth() + index * monthsPerPoint);
    return date;
  });
  return starts.slice(0, -1).map((start, index) => {
    const key = start.toISOString().slice(0, 10);
    const end = starts[index + 1].toISOString().slice(0, 10);
    const selected = dated.filter(({ date }) => date >= key && date < end).map(({ record }) => record);
    const last = new Date(Math.min(starts[index + 1].getTime() - DAY_MS, Date.parse(`${today}T00:00:00Z`)));
    const span = weekly ? `${fullDate.format(start)} – ${fullDate.format(last)}`
      : start.getUTCMonth() === last.getUTCMonth() && start.getUTCFullYear() === last.getUTCFullYear()
        ? monthDate.format(start) : `${monthDate.format(start)} – ${monthDate.format(last)}`;
    return { key, label: (weekly ? shortDate : monthDate).format(start),
      description: span + (index === count - 1 ? ' · En curso' : ''),
      quantity: selected.reduce((total, record) => total + record.quantity, 0), records: selected };
  });
}

/** Compare the entered text without changing it or inventing a catalogue of causes. */
export function mortalityReasons(records: readonly FlockMortality[]): { reason: string; quantity: number }[] {
  const groups = new Map<string, { reason: string; quantity: number }>();
  for (const record of records) {
    if (record.status !== 'recorded') continue;
    const reason = mortalityReason(record);
    const key = reason.normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('es-UY');
    const previous = groups.get(key);
    groups.set(key, { reason: previous?.reason ?? reason, quantity: (previous?.quantity ?? 0) + record.quantity });
  }
  return [...groups.values()].sort((left, right) => right.quantity - left.quantity);
}

export function leadingMortalityReasons(records: readonly FlockMortality[]): { reason: string; quantity: number }[] {
  const groups = mortalityReasons(records.filter((record) => record.notes?.trim()));
  return groups.filter((group) => group.quantity === groups[0]?.quantity);
}
