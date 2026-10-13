import { formatReportCell, queryFromForm, ReportFormValue } from './report-query';
import { reportSourceFixture } from '../testing/report-source.fixture';
import { reportOptionLabel } from './report-help';

describe('Report query and presentation', () => {
  const form = (): ReportFormValue => ({ columns: ['poultry_house', 'quantity'], groupings: [], metrics: [], from: '', to: '', sort: 'quantity', direction: 'desc', filters: [] });
  it('preserves exact decimal values beyond JavaScript number precision', () => {
    expect(formatReportCell('9007199254740993.123456', 'quantity')).toBe('9.007.199.254.740.993,123456');
    expect(formatReportCell(null, 'quantity')).toBe('—');
  });
  it('keeps date-only values independent from the device time zone', () => {
    expect(formatReportCell('2026-10-12', 'date')).toBe('12/10/2026');
  });
  it('serializes integer lists and actual booleans rather than truthy strings', () => {
    const value = form(); value.filters = [{ field: 'poultry_house_id', operator: 'in', value: '1, 2' }, { field: 'active', operator: 'eq', value: 'false' }];
    expect(queryFromForm(reportSourceFixture(), value).filters).toEqual([{ field: 'poultry_house_id', operator: 'in', value: [1, 2] }, { field: 'active', operator: 'eq', value: false }]);
  });
  it('rejects unsafe identifiers and reversed dates before submitting', () => {
    const value = form(); value.filters = [{ field: 'poultry_house_id', operator: 'eq', value: '9007199254740993' }];
    expect(() => queryFromForm(reportSourceFixture(), value)).toThrow('opción válida');
    value.filters = []; value.from = '2026-10-12'; value.to = '2026-10-01';
    expect(() => queryFromForm(reportSourceFixture(), value)).toThrow('fecha final');
  });
  it('sorts an aggregate only by dimensions or selected metrics', () => {
    const value = form(); value.metrics = ['egg_count'];
    expect(queryFromForm(reportSourceFixture(), value).sorts).toEqual([{ field: 'egg_count', direction: 'desc' }]);
  });
  it('does not send dates to a source of current stock', () => {
    const source = reportSourceFixture(); source.supports_date_range = false;
    const value = form(); value.from = '2020-01-01';
    expect(queryFromForm(source, value).from).toBeNull();
  });
  it('shows understandable choices while keeping the original filter values in requests', () => {
    const source = reportSourceFixture(); source.key = 'lots.weighing-measurements'; source.filters['mode'] = { label: 'Modo', type: 'enum', operators: ['eq'], options: ['individual', 'group'] };
    const value = form(); value.filters = [{ field: 'mode', operator: 'eq', value: 'group' }];
    expect(reportOptionLabel(source.key, 'mode', 'group', 'group')).toBe('Grupal');
    expect(queryFromForm(source, value).filters).toEqual([{ field: 'mode', operator: 'eq', value: 'group' }]);
    expect(reportOptionLabel('inventory.movements', 'type', 'receipt', 'receipt')).toBe('Ingreso');
    expect(reportOptionLabel('inventory.stock-balances', 'base_unit', 'g', 'g')).toBe('Gramos (g)');
    expect(reportOptionLabel(source.key, 'mode', 'future', 'Otra opción')).toBe('Otra opción');
  });
});
