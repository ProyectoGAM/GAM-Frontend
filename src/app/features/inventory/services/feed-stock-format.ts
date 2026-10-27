import { formatQuantity } from './inventory-format';

/** Integer grams are kept exact in both display and editable kilogram values. */
export function feedKilogramInput(grams: string): string {
  const value = BigInt(grams);
  const absolute = value < 0n ? -value : value;
  const fraction = String(absolute % 1000n).padStart(3, '0').replace(/0+$/, '');
  return `${value < 0n ? '-' : ''}${absolute / 1000n}${fraction ? `.${fraction}` : ''}`;
}

export function formatFeedStock(grams: string): string {
  return `${formatQuantity(feedKilogramInput(grams))} kg`;
}

/** An empty field explicitly removes the minimum; undefined marks invalid input. */
export function feedMinimumGrams(kilograms: string): string | null | undefined {
  const input = kilograms.trim();
  if (!input) return null;
  const match = /^(\d{1,12})(?:[.,](\d{1,3}))?$/.exec(input);
  if (!match) return undefined;
  const grams = BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'));
  return grams <= 999999999999n ? String(grams) : undefined;
}
