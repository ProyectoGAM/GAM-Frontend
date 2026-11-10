import { maintenanceCost, maintenanceTimestampLabel, maintenanceToday, validMaintenanceDate } from './maintenance-presentation';

describe('Maintenance form values', () => {
  it('accepts zero and normalizes exact UYU amounts without rounding', () => {
    expect(maintenanceCost('0')).toBe('0.00');
    expect(maintenanceCost('000,50')).toBe('0.50');
    expect(maintenanceCost('999999999999999.99')).toBe('999999999999999.99');
    for (const invalid of ['', '-1', '1.234', '1.250,50', '1e3', 'NaN', '1000000000000000']) expect(maintenanceCost(invalid)).toBeNull();
  });

  it('uses the date in Uruguay even near UTC midnight and rejects future or impossible dates', () => {
    expect(maintenanceToday(new Date('2026-11-02T01:00:00Z'))).toBe('2026-11-01');
    expect(validMaintenanceDate(maintenanceToday())).toBe(true);
    expect(validMaintenanceDate('2026-02-30')).toBe(false);
    expect(validMaintenanceDate('2999-01-01')).toBe(false);
  });

  it('formats record timestamps in Uruguay and represents unavailable dates explicitly', () => {
    expect(maintenanceTimestampLabel('2026-01-02T01:00:00Z')).toContain('01 ene. 2026');
    expect(maintenanceTimestampLabel('2026-01-02T01:00:00Z')).toContain('22:00');
    expect(maintenanceTimestampLabel(null)).toBe('No disponible');
  });
});
