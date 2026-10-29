import { formatFeedKilograms, multiplyRecipeYield } from './feed-manufacture-quantity';

describe('feed manufacture quantities', () => {
  it('multiplies the recipe base exactly, including bases below one kilogram', () => {
    expect(multiplyRecipeYield('13000', '1')).toBe('13000');
    expect(multiplyRecipeYield('13000', '2')).toBe('26000');
    expect(multiplyRecipeYield('1001', '3')).toBe('3003');
    expect(multiplyRecipeYield('13', ' 02 ')).toBe('26');
  });

  it('rejects empty, zero, negative, fractional and nonnumeric multipliers', () => {
    for (const value of ['', '0', '-1', '1.5', '1,5', '2.0', '1e3', 'Infinity', 'abc', '1 000']) {
      expect(multiplyRecipeYield('13000', value), value).toBeNull();
    }
  });

  it('respects the exact stock maximum and rejects invalid recipe bases', () => {
    expect(multiplyRecipeYield('1', '999999999999')).toBe('999999999999');
    expect(multiplyRecipeYield('13000', '76923076')).toBe('999999988000');
    expect(multiplyRecipeYield('13000', '76923077')).toBeNull();
    expect(multiplyRecipeYield('1', '1000000000000')).toBeNull();
    for (const base of ['0', '-1', '', '1.5', '1000000000000']) {
      expect(multiplyRecipeYield(base, '2'), base).toBeNull();
    }
  });

  it('formats fractional ingredient quantities and large balances without losing digits', () => {
    expect(formatFeedKilograms('26000')).toBe('26 kg');
    expect(formatFeedKilograms('250.000001')).toBe('0,250000001 kg');
    expect(formatFeedKilograms('999999999999.999999')).toBe('999.999.999,999999999 kg');
    expect(formatFeedKilograms('-1500.500000')).toBe('-1,5005 kg');
  });
});
