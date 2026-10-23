import { FeedAdjustmentAction } from '../types/feed-adjustment-action.type';

/** Inputs are integer grams; existing balances retain all six fractional gram digits. */
export function adjustmentGrams(kilograms: string, action: FeedAdjustmentAction): string | null {
  const match = /^(\d{1,12})(?:[.,](\d{1,3}))?$/.exec(kilograms.trim());
  if (!match) return null;
  const grams = BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'));
  return grams <= 999999999999n && (grams > 0n || action === 'establecer') ? String(grams) : null;
}

export function adjustmentResult(stock: string, grams: string, action: FeedAdjustmentAction): string | null {
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(stock);
  if (!match || !/^\d{1,12}$/.test(grams)) return null;
  const before = (BigInt(match[2]) * 1000000n + BigInt((match[3] ?? '').padEnd(6, '0'))) * (match[1] ? -1n : 1n);
  const value = BigInt(grams) * 1000000n;
  const after = action === 'sumar' ? before + value : action === 'restar' ? before - value : value;
  if (after < 0n || after > 999999999999999999n) return null;
  const fraction = String(after % 1000000n).padStart(6, '0').replace(/0+$/, '');
  return `${after / 1000000n}${fraction ? `.${fraction}` : ''}`;
}
