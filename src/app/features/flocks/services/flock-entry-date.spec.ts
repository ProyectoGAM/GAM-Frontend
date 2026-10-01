import { describe, expect, it } from 'vitest';

import { formatFlockEntryDate } from './flock-entry-date';

describe('formatFlockEntryDate', () => {
  it('formats the API calendar date as day-month-year', () => {
    expect(formatFlockEntryDate('2027-08-14')).toBe('14-08-2027');
    expect(formatFlockEntryDate('2028-02-29')).toBe('29-02-2028');
  });

  it('returns no label for an invalid entry date', () => {
    expect(formatFlockEntryDate('2027-02-29')).toBeNull();
    expect(formatFlockEntryDate('not-a-date')).toBeNull();
  });
});
