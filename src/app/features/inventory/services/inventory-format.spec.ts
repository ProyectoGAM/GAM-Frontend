import { decimalCompare, formatQuantity, formatQuantityInput, isDiscreteUnit, signedQuantity } from './inventory-format';

describe('inventory formatting', () => {
  it('formats decimal strings without changing the contract value', () => {
    expect(formatQuantity('1000.000000', 'kg')).toBe('1.000 kg');
    expect(formatQuantity('12.340000', 'dose')).toBe('12,34 dosis');
    expect(signedQuantity('-12.000000', 'dose')).toBe('-12 dosis');
  });

  it('removes insignificant decimals and keeps Spanish Uruguay separators without rounding', () => {
    expect(formatQuantity('100.000000', 'dose')).toBe('100 dosis');
    expect(formatQuantity('-100.000000', 'dose')).toBe('-100 dosis');
    expect(formatQuantity('12.500000', 'kg')).toBe('12,5 kg');
    expect(formatQuantity('12.250000', 'l')).toBe('12,25 L');
    expect(formatQuantity('100.000000', 'kg')).toBe('100 kg');
    expect(formatQuantity('1000000.000000', 'kg')).toBe('1.000.000 kg');
  });

  it('prefills editable quantities without insignificant zeroes or thousands grouping', () => {
    expect(formatQuantityInput('2.000000')).toBe('2');
    expect(formatQuantityInput('12.500000')).toBe('12,5');
    expect(formatQuantityInput('1234.500000')).toBe('1234,5');
    expect(formatQuantityInput('0.000001')).toBe('0,000001');
  });

  it('treats only canonical unit and dose values as discrete', () => {
    expect(isDiscreteUnit('unit')).toBe(true);
    expect(isDiscreteUnit('dose')).toBe(true);
    expect(isDiscreteUnit('kg')).toBe(false);
    expect(isDiscreteUnit('custom_unit')).toBe(false);
    expect(isDiscreteUnit(undefined)).toBe(false);
  });

  it('compares decimal strings without converting them to floating point', () => {
    expect(decimalCompare('100000000000000000.000001', '100000000000000000')).toBe(1);
    expect(decimalCompare('0.000000', '0')).toBe(0);
    expect(decimalCompare('-1.5', '0')).toBe(-1);
  });
});
import { formatStockQuantity } from './inventory-format';

describe('stock presentation units', () => {
  it('converts grams exactly while retaining fractional and large decimal precision', () => {
    expect(formatStockQuantity('1230000.000000', 'g')).toBe('1.230 kg');
    expect(formatStockQuantity('1234.567891', 'g')).toBe('1,234567891 kg');
    expect(formatStockQuantity('999.999999', 'g')).toBe('999,999999 g');
    expect(formatStockQuantity('-1230000', 'g')).toBe('-1.230 kg');
    expect(formatStockQuantity('9007199254740993123456.123456', 'g')).toBe('9.007.199.254.740.993.123,456123456 kg');
    expect(formatStockQuantity('85.5', 'l')).toBe('85,5 L');
  });
});
