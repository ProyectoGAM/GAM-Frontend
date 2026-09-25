import { decimalCompare, formatQuantity, signedQuantity } from './inventory-format';

describe('inventory formatting', () => {
  it('formats decimal strings without changing the contract value', () => {
    expect(formatQuantity('1000.000000', 'kg')).toBe('1.000 kg');
    expect(formatQuantity('12.340000', 'dose')).toBe('12,34 dosis');
    expect(signedQuantity('-12.000000', 'dose')).toBe('-12 dosis');
  });

  it('compares decimal strings without converting them to floating point', () => {
    expect(decimalCompare('100000000000000000.000001', '100000000000000000')).toBe(1);
    expect(decimalCompare('0.000000', '0')).toBe(0);
    expect(decimalCompare('-1.5', '0')).toBe(-1);
  });
});
