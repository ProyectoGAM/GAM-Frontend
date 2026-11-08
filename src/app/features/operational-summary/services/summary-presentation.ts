import { todayInLotsTimezone } from '../../flocks/services/flock-detail.service';
import type { NotificationUrgency } from '../../notifications/types/notification.type';
import type { SummaryPeriod } from '../interfaces/operational-summary';

export const urgencyLevels: readonly { key: NotificationUrgency; label: string }[] = [
  { key: 'alto', label: 'Alta' }, { key: 'medio', label: 'Media' }, { key: 'bajo', label: 'Baja' },
];

const numeric = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 });
const instant = new Intl.DateTimeFormat('es-UY', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Montevideo',
});
const shortDay = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function summaryPeriod(days: number, today = todayInLotsTimezone()): SummaryPeriod {
  const start = new Date(today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to: today };
}

export function summaryNumber(value: number | string): string {
  return numeric.format(Number(value));
}

export function summaryMoney(value: string, currency: string): string {
  const decimal = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!decimal) return 'Importe desconocido';
  const [, sign, whole, fraction = ''] = decimal;
  const digits = fraction.replace(/0+$/, '');
  return (sign ? '−' : '') + numeric.format(BigInt(whole)) + (digits ? ',' + digits : '') + ' ' + currency;
}

export function summaryInstant(value: string): string {
  return instant.format(new Date(value));
}

export function eggChange(value: number | null): string {
  return value === null ? 'Sin base de comparación' : (value > 0 ? '+' : '') + summaryNumber(value) + ' %';
}

export function productionDays(period: SummaryPeriod, entries: readonly { date: string; quantity: number }[]) {
  const quantities = new Map(entries.map((entry) => [entry.date, entry.quantity]));
  const result: { date: string; label: string; quantity: number | null }[] = [];
  const last = new Date(period.to + 'T00:00:00Z');
  for (const day = new Date(period.from + 'T00:00:00Z'); day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    result.push({ date, label: shortDay.format(day), quantity: quantities.get(date) ?? null });
  }
  return result;
}
