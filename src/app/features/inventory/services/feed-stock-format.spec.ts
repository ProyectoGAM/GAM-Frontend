import { feedKilogramInput, feedMinimumGrams, formatFeedStock } from './feed-stock-format';

describe('Feed stock quantities', () => {
  it('displays signed grams as exact kilograms, including sub-kilogram balances', () => {
    expect(formatFeedStock('999999999999')).toBe('999.999.999,999 kg');
    expect(formatFeedStock('-1')).toBe('-0,001 kg');
    expect(formatFeedStock('0')).toBe('0 kg');
    expect(formatFeedStock('125050')).toBe('125,05 kg');
    expect(feedKilogramInput('125050')).toBe('125.05');
  });
  it('accepts comma or dot and preserves the API range exactly', () => {
    expect(feedMinimumGrams(' 0,001 ')).toBe('1');
    expect(feedMinimumGrams('300.125')).toBe('300125');
    expect(feedMinimumGrams('999999999,999')).toBe('999999999999');
    expect(feedMinimumGrams('0')).toBe('0');
    expect(feedMinimumGrams('  ')).toBeNull();
  });
  it('rejects negatives, fractional grams, exponents and overflow', () => {
    for (const input of ['-1', '1.0001', '1,2.3', '1e3', '1000000000', '.', 'abc']) {
      expect(feedMinimumGrams(input), input).toBeUndefined();
    }
  });
});
