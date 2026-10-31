import { describe, expect, it } from 'vitest';

import { formatUyuMoney, parseUyuAmount, uyuDecimal } from './uyu-money';

describe('UYU exact amounts', () => {
  it('keeps a fractional sale and payment exact', () => {
    const sale = parseUyuAmount('12,625');
    const paid = parseUyuAmount('2.125');
    expect(sale).toBe(12625n);
    expect(uyuDecimal(sale! - paid!)).toBe('10.500');
  });

  it('keeps credit smaller than one peso visible with its sign', () => {
    expect(uyuDecimal(parseUyuAmount('-0.001')!)).toBe('-0.001');
    expect(formatUyuMoney('-0.001')).toBe('−$0,001');
  });

  it('formats pesos with a single dollar sign and local thousands separators', () => {
    expect(formatUyuMoney('1000')).toBe('$1.000');
    expect(formatUyuMoney('550')).toBe('$550');
  });

  it('rejects rounding, exponential notation and out of range amounts', () => {
    for (const text of ['1.0001', '1e3', 'Infinity', '10000000000000000000', '1,2,3']) expect(parseUyuAmount(text)).toBeNull();
  });

  it('does not lose integers beyond Number precision', () => {
    expect(uyuDecimal(parseUyuAmount('9999999999999999999.999')!)).toBe('9999999999999999999.999');
    expect(formatUyuMoney('12.625')).toContain('12,625');
  });
});
