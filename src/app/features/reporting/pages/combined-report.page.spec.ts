import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../admin/services/admin-unit-context.service';
import { ReportExport, ReportSource } from '../interfaces/report';
import { ReportingService } from '../services/reporting.service';
import { reportSourceFixture } from '../testing/report-source.fixture';
import { CombinedReportPage } from './combined-report.page';

describe('CombinedReportPage', () => {
  const production = reportSourceFixture();
  production.filters['production_unit_id'] = { label: 'Unidad productiva', type: 'integer', operators: ['eq'] };
  const inventory: ReportSource = {
    ...reportSourceFixture(), key: 'inventory.stock-balances', supports_date_range: false,
    columns: { product: { label: 'Producto', type: 'string' } }, default_columns: ['product'],
    filters: {}, sorts: { product: { label: 'Producto', direction: 'asc' } }, default_sort: 'product:asc',
  };
  const unit = signal<number | null>(7);
  const user = signal<{ id: number } | null>({ id: 1 });
  const unitContext = {
    selectedId: unit, state: signal('ready'), selectedUnit: computed(() => unit() ? { name: 'El Ombú' } : null),
  };
  const file: ReportExport = {
    id: 88, source_key: 'combined', format: 'xlsx', status: 'completed',
    file_name: 'varios.xlsx', expires_at: null, failure_message: null,
  };
  const api = { sources: vi.fn(), preview: vi.fn(), requestCombinedExport: vi.fn(), watchExport: vi.fn(), download: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    unit.set(7);
    user.set({ id: 1 });
    api.sources.mockReturnValue(of({ data: [production, inventory] }));
    api.preview.mockImplementation(source_key => of({ data: {
      source_key, definition_version: '1.0', columns: ['quantity'], rows: [{ quantity: 12 }], units: {},
      pagination: { current_page: 1, per_page: 50, total: 1, last_page: 1 }, generated_at: '2026-11-26T12:00:00Z',
    } }));
    api.requestCombinedExport.mockReturnValue(of({ data: { ...file, status: 'pending' } }));
    api.watchExport.mockReturnValue(of({ data: file }));
    api.download.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [CombinedReportPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user } },
        { provide: AdminUnitContextService, useValue: unitContext },
        { provide: ReportingService, useValue: api },
      ],
    });
  });

  function open() {
    const fixture = TestBed.createComponent(CombinedReportPage);
    fixture.detectChanges();
    return fixture;
  }

  function addSections(page: CombinedReportPage): void {
    for (const topic of page.topics()) {
      for (const source of topic.available) page.toggle(source, topic);
    }
  }

  it('preserves each section, excludes dates for the snapshot, and queues both sources in the chosen order', async () => {
    const fixture = open();
    const page = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;
    const button = (label: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === label)!;
    expect(button('Continuar a datos').disabled).toBe(true);
    host.querySelector<HTMLInputElement>('.source-choice input')!.click();
    fixture.detectChanges();
    button('Inventario').click();
    fixture.detectChanges();
    host.querySelector<HTMLInputElement>('.source-choice input')!.click();
    fixture.detectChanges();
    button('Continuar a datos').click();
    fixture.detectChanges();
    page.configure(production.key, { summary: true, metrics: ['egg_count'] });
    page.select(inventory.key);
    expect(page.section()?.columns).toEqual(['product']);
    page.select(production.key);
    page.goTo(3);
    page.dates.set({ from: '2026-11-01', to: '2026-11-26' });
    page.section()?.filters.find(filter => filter.key === 'poultry_house_id')?.value.setValue('5');
    page.goTo(4);
    fixture.detectChanges();
    expect(api.preview).toHaveBeenCalledWith(production.key, expect.objectContaining({
      from: '2026-11-01', to: '2026-11-26', metrics: ['egg_count'],
      filters: [
        { field: 'poultry_house_id', operator: 'eq', value: 5 },
        { field: 'production_unit_id', operator: 'eq', value: 7 },
      ],
    }));
    page.select(inventory.key);
    expect(api.preview).toHaveBeenLastCalledWith(inventory.key, expect.objectContaining({ from: null, to: null, filters: [] }));
    page.export('xlsx');
    expect(api.requestCombinedExport).toHaveBeenCalledWith([
      { source_key: production.key, query: expect.objectContaining({ metrics: ['egg_count'] }) },
      { source_key: inventory.key, query: expect.objectContaining({ columns: ['product'], from: null, to: null }) },
    ], 'xlsx', expect.any(String));
    expect(api.watchExport).toHaveBeenCalledWith(88);
    expect(page.exportFile()).toEqual(file);
    await page.download(file);
    expect(api.download).toHaveBeenCalledWith(file);
  });

  it('cancels an old preview and applies the new dashboard scope without carrying over its galpón filter', () => {
    const fixture = open();
    const page = fixture.componentInstance;
    addSections(page);
    page.goTo(2);
    page.goTo(3);
    page.section()?.filters.find(filter => filter.key === 'poultry_house_id')?.value.setValue('5');
    const stale = new Subject();
    api.preview.mockReturnValueOnce(stale);
    page.goTo(4);
    expect(stale.observed).toBe(true);

    unit.set(3);
    fixture.detectChanges();
    expect(stale.observed).toBe(false);
    expect(api.preview).toHaveBeenLastCalledWith(production.key, expect.objectContaining({
      filters: [{ field: 'production_unit_id', operator: 'eq', value: 3 }],
    }));
  });
});
