import { adjustmentGrams, adjustmentResult } from './feed-adjustment-quantity';

describe('Feed ingredient adjustment quantities', () => {
  it('accepts comma or dot and converts kg to exact integer grams', () => {
    expect(adjustmentGrams('25', 'sumar')).toBe('25000');
    expect(adjustmentGrams(' 0,001 ', 'restar')).toBe('1');
    expect(adjustmentGrams('1.234', 'sumar')).toBe('1234');
    expect(adjustmentGrams('999999999,999', 'establecer')).toBe('999999999999');
  });

  it('allows zero only when fixing stock and rejects invalid or excessive amounts', () => {
    expect(adjustmentGrams('0', 'establecer')).toBe('0');
    for (const action of ['sumar', 'restar'] as const) expect(adjustmentGrams('0', action)).toBeNull();
    for (const value of ['', '-1', '1e3', '1.0001', '1,2.3', '1000000000']) {
      expect(adjustmentGrams(value, 'establecer')).toBeNull();
    }
  });

  it('calculates all three operations while preserving fractional gram balances', () => {
    expect(adjustmentResult('120000.000000', '25000', 'sumar')).toBe('145000');
    expect(adjustmentResult('120000', '25000', 'restar')).toBe('95000');
    expect(adjustmentResult('120000.123456', '25000', 'establecer')).toBe('25000');
    expect(adjustmentResult('120000.123456', '25000', 'sumar')).toBe('145000.123456');
    expect(adjustmentResult('120000.123456', '25000', 'restar')).toBe('95000.123456');
    expect(adjustmentResult('0.123456', '0', 'establecer')).toBe('0');
    expect(adjustmentResult('-1000.5', '1001', 'sumar')).toBe('0.5');
  });

  it('rejects negative results, unknown balances and storage overflow', () => {
    expect(adjustmentResult('120000', '120001', 'restar')).toBeNull();
    expect(adjustmentResult('999999999999.999999', '1', 'sumar')).toBeNull();
    expect(adjustmentResult('999999999998.999999', '1', 'sumar')).toBe('999999999999.999999');
    expect(adjustmentResult('unavailable', '1', 'sumar')).toBeNull();
  });
});
