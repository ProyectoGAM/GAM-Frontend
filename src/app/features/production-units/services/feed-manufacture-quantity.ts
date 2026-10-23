const integerFormatter = new Intl.NumberFormat('es-UY');

/** The API accepts positive integer grams, up to its stock quantity limit. */
export function kilogramsToGrams(value: string): string | null {
  const match = /^(\d{1,12})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const grams = BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'));
  return grams > 0n && grams <= 999999999999n ? String(grams) : null;
}

export function isYieldMultiple(grams: string, yieldGrams: string): boolean {
  return /^\d+$/.test(grams) && /^\d+$/.test(yieldGrams)
    && BigInt(yieldGrams) > 0n && BigInt(grams) > 0n && BigInt(grams) % BigInt(yieldGrams) === 0n;
}

/** Preserve fractional ingredient balances without floating-point rounding. */
export function formatFeedKilograms(grams: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(grams);
  if (!match) return '—';
  const integer = BigInt(match[2]);
  const fraction = `${String(integer % 1000n).padStart(3, '0')}${match[3] ?? ''}`.replace(/0+$/, '');
  return `${match[1]}${integerFormatter.format(integer / 1000n)}${fraction ? `,${fraction}` : ''} kg`;
}
