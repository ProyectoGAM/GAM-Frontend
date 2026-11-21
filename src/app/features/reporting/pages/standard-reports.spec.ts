import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../shared/testing/native-dialog-test';
import { ReportQuery, ReportResult, ReportSource } from '../interfaces/report';
import { reportingRoutes } from '../reporting.routes';
import { reportNames, reportTopics } from '../services/report-presentation';
import { ReportingService } from '../services/reporting.service';
import { reportSourceFixture } from '../testing/report-source.fixture';
import { ReportsPage } from './reports.page';

describe('Predefined reports', () => {
  let harness: RouterTestingHarness;
  let source: ReportSource;
  let restoreDialog: () => void;
  const api = { sources: vi.fn(), options: vi.fn(), preview: vi.fn() };
  const user = signal({ id: 1 });
  const result: ReportResult = { source_key: 'lots.egg-production', definition_version: '1.0', columns: ['poultry_house', 'egg_count'], rows: [{ poultry_house: 'Norte', egg_count: '4200' }], units: { egg_count: 'huevos' }, pagination: { current_page: 1, last_page: 3, total: 120, per_page: 50 }, generated_at: '2026-11-17T12:00:00Z' };

  beforeAll(() => { restoreDialog = stubNativeDialog(); });
  afterAll(() => restoreDialog());
  beforeEach(async () => {
    vi.clearAllMocks();
    source = reportSourceFixture();
    source.filters = { poultry_house_id: { label: 'Galpón', type: 'integer', operators: ['eq', 'in'], options_source: 'poultry_house_id' }, active: source.filters['active'] };
    source.groupings = { ...source.groupings, day: { label: 'Día', type: 'date' }, month: { label: 'Mes', type: 'date' } };
    source.standard_queries = [
      { label: 'Por día y lote', configuration: { groupings: ['day', 'poultry_house'], metrics: ['egg_count'] } },
      { label: 'Por mes y galpón', configuration: { groupings: ['month', 'poultry_house'], metrics: ['egg_count'] } },
      { label: 'Por galpón', configuration: { groupings: ['poultry_house'], metrics: ['egg_count'] } },
    ];
    api.sources.mockReturnValue(of({ data: [source] }));
    api.options.mockReturnValue(of({ data: [{ value: 11, label: 'Galpón Norte' }], pagination: { current_page: 1, last_page: 1, total: 1 } }));
    api.preview.mockImplementation((_key: string, query: ReportQuery) => of({ data: !query.groupings?.length && query.metrics?.includes('egg_count') ? { ...result, rows: [{ egg_count: '9007199254740993' }] } : result }));
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'administracion/reportes/reportes', children: reportingRoutes }]), { provide: AuthStore, useValue: { user } }, { provide: ReportingService, useValue: api }] });
    harness = await RouterTestingHarness.create();
  });
  const open = async (path = '/ver/lots.egg-production') => {
    const page = await harness.navigateByUrl('/administracion/reportes/reportes' + path, ReportsPage);
    await harness.fixture.whenStable(); harness.detectChanges(); return page;
  };

  it('exposes all 23 authorized reports in seven categories without executing them', async () => {
    api.sources.mockReturnValue(of({ data: Object.keys(reportNames).map(key => ({ ...source, key })) }));
    await open('');
    const root = harness.routeNativeElement!;
    expect(root.querySelectorAll('.category-card')).toHaveLength(7);
    expect(root.querySelectorAll('.category-card a')).toHaveLength(23);
    for (const [key, label] of Object.entries(reportNames)) {
      expect(root.querySelector(`a[href$="/ver/${key}"]`)?.textContent).toContain(label);
    }
    expect(new Set(reportTopics.flatMap(topic => topic.sources)).size).toBe(23);
    expect(api.preview).not.toHaveBeenCalled();
  });

  it('omits categories and report links not granted by the backend', async () => {
    await open('');
    const root = harness.routeNativeElement!;
    expect(root.querySelectorAll('.category-card')).toHaveLength(1);
    expect(root.querySelectorAll('.category-card a')).toHaveLength(1);
    expect(root.textContent).not.toContain('Clientes y cuentas');
  });

  it('shows direct filters and full-history server totals independent of table pagination', async () => {
    const page = await open(); const root = harness.routeNativeElement!;
    expect(root.querySelector('h1')?.textContent).toBe('Huevos recolectados');
    expect(root.querySelector('.report-filters details')).toBeNull();
    expect(root.querySelector('app-searchable-select')).not.toBeNull();
    expect(page.selectedStandard()).toBe(2);
    expect(page.eggTotal()).toBe('9.007.199.254.740.993');
    expect(root.querySelector('.report-total')?.textContent).toContain('9.007.199.254.740.993');
    expect(api.preview).toHaveBeenCalledWith(source.key, expect.objectContaining({ groupings: [], metrics: ['egg_count'], page: 1 }));
    expect(root.querySelector('.text-link')).toBeNull();
  });

  it('preserves dates and filters across predefined groupings, detail and pagination', async () => {
    const page = await open();
    page.form.patchValue({ from: '2026-09-01', to: '2026-09-30' });
    page.filters.at(0).controls.value.setValue('11');
    page.standard(0);
    const filters = [{ field: 'poultry_house_id', operator: 'eq', value: 11 }];
    expect(api.preview).toHaveBeenLastCalledWith(source.key, expect.objectContaining({ from: '2026-09-01', to: '2026-09-30', filters, groupings: ['day', 'poultry_house'] }));
    page.detailView(); page.query(2);
    expect(api.preview).toHaveBeenLastCalledWith(source.key, expect.objectContaining({ from: '2026-09-01', to: '2026-09-30', filters, groupings: [], metrics: [], page: 2 }));
  });

  it('offers the previous calendar month and clears dates for all history', async () => {
    const page = await open(); page.setPeriod('previous');
    const from = page.form.controls.from.value; const to = page.form.controls.to.value;
    expect(from.endsWith('-01')).toBe(true);
    expect(new Date(to + 'T12:00:00Z').getUTCMonth()).toBe(new Date(from + 'T12:00:00Z').getUTCMonth());
    expect(new Date(new Date(to + 'T12:00:00Z').getTime() + 86400000).getUTCDate()).toBe(1);
    expect(page.activePeriod()).toBe('previous');
    page.setPeriod('all'); expect(page.form.controls.from.value).toBe(''); expect(page.form.controls.to.value).toBe('');
  });

  it('applies additional conditions from the modal and can clear them', async () => {
    const page = await open(); const root = harness.routeNativeElement!;
    Array.from(root.querySelectorAll('button')).find(button => button.textContent?.includes('Más filtros'))!.click();
    const dialog = root.querySelector<HTMLDialogElement>('dialog')!; expect(dialog.open).toBe(true);
    const house = dialog.querySelector<HTMLSelectElement>('#advanced-value-0')!;
    house.value = '11'; house.dispatchEvent(new Event('change')); harness.detectChanges();
    expect(root.querySelector<HTMLInputElement>('#main-filter-0')?.value).toBe('Galpón Norte');
    page.filters.at(0).patchValue({ operator: 'in', value: '11' });
    Array.from(dialog.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Ver reporte')!.click();
    expect(dialog.open).toBe(false);
    expect(api.preview).toHaveBeenLastCalledWith(source.key, expect.objectContaining({ filters: [{ field: 'poultry_house_id', operator: 'in', value: [11] }] }));
    page.clearAdditionalFilters(); expect(page.filters.at(0).getRawValue()).toEqual({ field: 'poultry_house_id', operator: 'eq', value: '' });
  });

  it('keeps the table available when the optional total cannot be calculated', async () => {
    api.preview.mockImplementation((_key: string, query: ReportQuery) => !query.groupings?.length && query.metrics?.includes('egg_count') ? throwError(() => new Error('Unavailable total')) : of({ data: result }));
    const page = await open();
    expect(page.eggTotal()).toBeNull(); expect(page.result()).toEqual(result);
    expect(harness.routeNativeElement!.querySelector('.report-total')).toBeNull();
  });

  it('adapts current-stock reports without date fields or an invented date range', async () => {
    const stock = { ...source, key: 'inventory.stock-balances', supports_date_range: false, standard_queries: [] };
    api.sources.mockReturnValue(of({ data: [stock] }));
    await open('/ver/inventory.stock-balances');
    expect(harness.routeNativeElement!.querySelector('input[type="date"]')).toBeNull();
    expect(harness.routeNativeElement!.textContent).toContain('Existencias actuales');
    expect(api.preview).toHaveBeenLastCalledWith(stock.key, expect.objectContaining({ from: null, to: null }));
  });
});
