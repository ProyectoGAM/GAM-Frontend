import { describe, expect, it } from 'vitest';
import { formatFuelLiters, formatFuelVolume, vehicleDocumentExpired } from './vehicle-format';

describe('formatFuelLiters', () => {
  it('omits API precision decimals and keeps localized thousands separators', () => {
    expect(formatFuelLiters('10.000')).toBe('10');
    expect(formatFuelLiters('10.500')).toBe('11');
    expect(formatFuelLiters('10000.000')).toBe('10.000');
  });
});

describe('formatFuelVolume', () => {
  it('shows the volume recorded in the history without rounding to whole liters', () => {
    expect(formatFuelVolume('48.125')).toBe('48,125 l');
    expect(formatFuelVolume('40.000')).toBe('40 l');
  });
});

describe('vehicleDocumentExpired', () => {
  it('keeps a document valid through its expiry day in Uruguay', () => {
    expect(vehicleDocumentExpired('2026-11-05', new Date('2026-11-06T02:59:59Z'))).toBe(false);
    expect(vehicleDocumentExpired('2026-11-05', new Date('2026-11-06T03:00:00Z'))).toBe(true);
    expect(vehicleDocumentExpired(null, new Date('2026-11-06T03:00:00Z'))).toBe(false);
  });
});
