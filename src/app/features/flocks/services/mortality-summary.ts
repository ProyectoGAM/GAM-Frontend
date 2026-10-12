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
export function mortalitySummary(records: readonly FlockMortality[], period: MortalityPeriod, today: string): MortalityPoint[] {
  const current = new Date(`${today}T00:00:00Z`);
  const count = period === 'day' ? 7 : period === 'week' ? 8 : 6;
  if (period === 'week') current.setUTCDate(current.getUTCDate() - (current.getUTCDay() + 6) % 7);
  if (period === 'month') current.setUTCDate(1);
  const starts = Array.from({ length: count + 1 }, (_, index) => {
    const date = new Date(current);
    const offset = index - count + 1;
    if (period === 'month') date.setUTCMonth(date.getUTCMonth() + offset);
    else date.setUTCDate(date.getUTCDate() + offset * (period === 'week' ? 7 : 1));
    return date;
  });
  const dated = records.filter((record) => record.status === 'recorded')
    .map((record) => ({ record, date: mortalityDate(record) })).filter(({ date }) => date <= today);
  return starts.slice(0, -1).map((start, index) => {
    const key = start.toISOString().slice(0, 10);
    const end = starts[index + 1].toISOString().slice(0, 10);
    const selected = dated.filter(({ date }) => date >= key && date < end).map(({ record }) => record);
    const last = new Date(Math.min(starts[index + 1].getTime() - DAY_MS, Date.parse(`${today}T00:00:00Z`)));
    return { key, label: (period === 'month' ? monthDate : shortDate).format(start),
      description: period === 'day' ? fullDate.format(start) : period === 'month'
        ? `${monthDate.format(start)}${index === count - 1 ? ' · En curso' : ''}`
        : `${fullDate.format(start)} – ${fullDate.format(last)}${index === count - 1 ? ' · En curso' : ''}`,
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
