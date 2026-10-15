import { DailyFeedPoint, FeedConsumption, FeedRecipeSummary, FeedingStage, FlockFeeding, ScheduledFeedingStage } from '../interfaces/flock-feeding.interface';

const integers = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });
const dates = new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Integer arithmetic preserves every gram, including totals beyond Number.MAX_SAFE_INTEGER. */
export function formatFeedKg(grams: string): string {
  const value = BigInt(grams);
  const magnitude = value < 0n ? -value : value;
  const fraction = (magnitude % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return `${value < 0n ? '-' : ''}${integers.format(magnitude / 1000n)}${fraction ? ',' + fraction : ''}`;
}

export function feedingDate(date: string): string {
  return dates.format(new Date(`${date}T00:00:00Z`));
}

/** UI kilograms accept at most three decimals; the API only receives exact integer grams. */
export function parseFeedKg(value: string, allowZero: boolean): string | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,12}(?:\.\d{1,3})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const grams = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return grams > 999999999999n || grams < (allowZero ? 0n : 1n) ? null : grams.toString();
}

export function snapshotRecipeName(stage: FeedingStage | null | undefined, recipeId: number): string | null {
  if (stage?.recipe_id !== recipeId) return null;
  const name = stage.recipe_snapshot['name'];
  return typeof name === 'string' && name.trim() ? name : null;
}

/** Feeding ages are one-based; date-only UTC arithmetic avoids device timezone/DST shifts. */
export function nextFeedingChange(current: FlockFeeding, stages: readonly ScheduledFeedingStage[], today: string): { date: string; day: number } | null {
  if (current.finalizado) return null;
  const next = stages.filter((stage) => stage.start_day > current.edad_dias)
    .sort((a, b) => a.start_day - b.start_day)[0];
  if (!next) return null;
  const timestamp = Date.parse(`${today}T00:00:00Z`) + (next.start_day - current.edad_dias) * 86_400_000;
  return { date: new Date(timestamp).toISOString().slice(0, 10), day: next.start_day };
}

export function feedSummary(records: readonly FeedConsumption[], names: ReadonlyMap<number, string>): FeedRecipeSummary[] {
  const totals = new Map<number, bigint>();
  for (const record of records) {
    totals.set(record.receta_id, (totals.get(record.receta_id) ?? 0n) + BigInt(record.cantidad_g));
  }
  return [...totals].map(([recipeId, grams]) => ({
    recipeId, name: names.get(recipeId) ?? `Receta #${recipeId}`, grams: grams.toString(), quantityText: formatFeedKg(grams.toString()),
  })).sort((a, b) => a.name.localeCompare(b.name, 'es') || a.recipeId - b.recipeId);
}

export function dailyFeedPoints(records: readonly FeedConsumption[], recipeId: number | null, fromDate: string | null, toDate: string): DailyFeedPoint[] {
  const days = new Map<string, bigint>();
  for (const record of records) {
    if (record.receta_id !== recipeId || (fromDate && record.fecha < fromDate) || record.fecha > toDate) continue;
    days.set(record.fecha, (days.get(record.fecha) ?? 0n) + BigInt(record.cantidad_g));
  }
  // Absent dates remain absent: a missing daily closure is not a zero consumption.
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, grams]) => ({
    date, grams: grams.toString(), quantityText: formatFeedKg(grams.toString()),
  }));
}
