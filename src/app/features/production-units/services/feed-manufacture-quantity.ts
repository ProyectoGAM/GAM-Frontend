const integerFormatter = new Intl.NumberFormat('es-UY');

/** Whole recipe batches, calculated exactly within the API's stock quantity limit. */
export function multiplyRecipeYield(yieldGrams: string, multiplier: string): string | null {
  const factor = multiplier.trim();
  if (!/^\d{1,12}$/.test(yieldGrams) || !/^\d{1,12}$/.test(factor)) return null;
  const base = BigInt(yieldGrams);
  const grams = base * BigInt(factor);
  return base > 0n && grams > 0n && grams <= 999999999999n ? String(grams) : null;
}

/** Preserve fractional ingredient balances without floating-point rounding. */
export function formatFeedKilograms(grams: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(grams);
  if (!match) return '—';
  const integer = BigInt(match[2]);
  const fraction = `${String(integer % 1000n).padStart(3, '0')}${match[3] ?? ''}`.replace(/0+$/, '');
  return `${match[1]}${integerFormatter.format(integer / 1000n)}${fraction ? `,${fraction}` : ''} kg`;
}
