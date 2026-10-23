import { formatFeedKilograms, isYieldMultiple, kilogramsToGrams } from './feed-manufacture-quantity';

describe('feed manufacture quantities', () => {
  it('converts kg to exact integer grams with either decimal separator', () => {
    expect(kilogramsToGrams('26')).toBe('26000');
    expect(kilogramsToGrams('0,013')).toBe('13');
    expect(kilogramsToGrams(' 1.001 ')).toBe('1001');
    expect(kilogramsToGrams('999999999.999')).toBe('999999999999');
  });

  it('rejects zero, negatives, fractional grams, scientific notation and overflow', () => {
    for (const value of ['', '0', '-1', '0.0001', '1e3', '1,000.1', '1000000000', 'Infinity']) {
      expect(kilogramsToGrams(value), value).toBeNull();
    }
  });

  it('accepts only positive whole multiples of the recipe yield', () => {
    expect(isYieldMultiple('26000', '13000')).toBe(true);
    expect(isYieldMultiple('26001', '13000')).toBe(false);
    expect(isYieldMultiple('13', '13')).toBe(true);
    expect(isYieldMultiple('0', '13')).toBe(false);
    expect(isYieldMultiple('1', '0')).toBe(false);
  });

  it('formats fractional ingredient quantities and large balances without losing digits', () => {
    expect(formatFeedKilograms('26000')).toBe('26 kg');
    expect(formatFeedKilograms('250.000001')).toBe('0,250000001 kg');
    expect(formatFeedKilograms('999999999999.999999')).toBe('999.999.999,999999999 kg');
    expect(formatFeedKilograms('-1500.500000')).toBe('-1,5005 kg');
  });
});
