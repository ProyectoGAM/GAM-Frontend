import { describe, expect, it } from 'vitest';
import { formatFuelLiters } from './vehicle-format';

describe('formatFuelLiters', () => {
  it('omits API precision decimals and keeps localized thousands separators', () => {
    expect(formatFuelLiters('10.000')).toBe('10');
    expect(formatFuelLiters('10.500')).toBe('11');
    expect(formatFuelLiters('10000.000')).toBe('10.000');
  });
});
