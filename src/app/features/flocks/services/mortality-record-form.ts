import { Flock } from '../interfaces/flock.interface';
import { MortalityDraft, RecordMortalityRequest } from '../interfaces/flock-mortality.interface';
import { todayInLotsTimezone } from './flock-detail.service';

const localTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** The user chose date-only input with the current farm-local time on the selected date. */
export function buildMortalityRequest(flock: Flock, draft: MortalityDraft, now = new Date()): RecordMortalityRequest | null {
  const date = new Date(`${draft.date}T00:00:00Z`);
  const minimum = [flock.entry_date, todayInLotsTimezone(new Date(flock.established_at))].sort().at(-1)!;
  const notes = draft.reason.trim();
  if (flock.status === 'finished' || !Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 2147483647
    || !notes || draft.reason.length > 5000 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== draft.date || draft.date < minimum || draft.date > todayInLotsTimezone(now)) return null;
  return { version: flock.version, quantity: draft.quantity,
    occurred_at: `${draft.date}T${localTime.format(now)}-03:00`, notes };
}
