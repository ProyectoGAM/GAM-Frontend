import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../admin/services/admin-unit-context.service';
import { ReportEnvelope, ReportPreset, ReportResult } from '../interfaces/report';
import { ReportingService } from '../services/reporting.service';
import { reportSourceFixture } from '../testing/report-source.fixture';
import { ReportsPage } from './reports.page';

describe('Reports and dashboard production unit', () => {
  const source = reportSourceFixture();
  source.filters = { production_unit_id: { label: 'Unidad productiva', type: 'integer', operators: ['eq', 'neq', 'in'], options_source: 'productionUnits' }, ...source.filters, flock_id: { label: 'Lote', type: 'string', operators: ['eq', 'in'] } };
  source.capabilities.presets = true;
  const id = signal<number | null>(7); const state = signal<'loading' | 'ready' | 'error'>('ready');
  const context = { selectedId: id, state, selectedUnit: computed(() => id() === null ? null : { id: id(), name: 'Granja ' + id() }) };
  const user = signal<{ id: number } | null>({ id: 1 });
  const result: ReportResult = { source_key: source.key, definition_version: source.definition_version, columns: ['quantity'], rows: [{ quantity: '400' }], units: {}, pagination: { current_page: 1, last_page: 1, total: 1, per_page: 50 }, generated_at: '2026-10-12T12:00:00Z' };
  const api = { sources: vi.fn(), options: vi.fn(), preview: vi.fn(), requestExport: vi.fn(), createPreset: vi.fn() };
  let fixture: ComponentFixture<ReportsPage>;

  const createPage = async (screen = 'view') => {
    const params = convertToParamMap({ sourceKey: source.key }); const queryParams = convertToParamMap({ source: source.key });
    await TestBed.configureTestingModule({ imports: [ReportsPage], providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { data: { screen }, paramMap: params, queryParamMap: queryParams }, paramMap: of(params), queryParamMap: of(queryParams) } }, { provide: AuthStore, useValue: { user } }, { provide: ReportingService, useValue: api }, { provide: AdminUnitContextService, useValue: context }] }).compileComponents();
    fixture = TestBed.createComponent(ReportsPage); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture.componentInstance;
  };
  const lastFilters = () => api.preview.mock.lastCall![1].filters;
  beforeEach(() => {
    vi.clearAllMocks(); id.set(7); state.set('ready'); user.set({ id: 1 });
    api.sources.mockReturnValue(of({ data: [source] }));
    api.options.mockReturnValue(of({ data: [], pagination: { current_page: 1, last_page: 1, total: 0 } }));
    api.preview.mockReturnValue(of({ data: result }));
    api.requestExport.mockReturnValue(of({ data: { id: 8, source_key: source.key, status: 'completed', format: 'xlsx', file_name: 'postura.xlsx' } }));
  });

  it('shows the selected dashboard unit even without report facts and sends its numeric ID', async () => {
    const page = await createPage();
    expect(lastFilters()).toContainEqual({ field: 'production_unit_id', operator: 'eq', value: 7 });
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#filter-0')!;
    expect(input.value).toBe('Granja 7'); expect(input.readOnly).toBe(true);
    expect(page.filters.at(0).disabled).toBe(true);
    expect(api.options.mock.calls.some(call => call[1] === 'production_unit_id')).toBe(false);
  });

  it('cancels obsolete previews, clears dependent filters and resets the pagination when the unit changes', async () => {
    const page = await createPage();
    page.filters.at(1).controls.value.setValue('11'); page.filters.at(3).controls.value.setValue('LOT-OLD');
    page.form.controls.from.setValue('2026-10-01'); page.query();
    const stale = new Subject<ReportEnvelope<ReportResult>>(); api.preview.mockReturnValueOnce(stale);
    page.query(2); expect(stale.observed).toBe(true);
    id.set(3); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(stale.observed).toBe(false); expect(lastFilters()).toContainEqual({ field: 'production_unit_id', operator: 'eq', value: 3 });
    expect(lastFilters().some((filter: { field: string }) => ['poultry_house_id', 'flock_id'].includes(filter.field))).toBe(false);
    expect(api.preview.mock.lastCall![1].page).toBe(1); expect(api.preview.mock.lastCall![1].from).toBe('2026-10-01');
    expect(page.filters.at(1).controls.value.value).toBe(''); expect(page.filters.at(3).controls.value.value).toBe('');
    stale.next({ data: { ...result, rows: [{ quantity: '999' }] } }); expect(page.result()?.rows[0]['quantity']).toBe('400');
    expect(page.pendingChanges()).toBe(false);
  });

  it('uses all units without an old unit condition when the dashboard switches to all', async () => {
    const page = await createPage(); id.set(null); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(lastFilters().some((filter: { field: string }) => filter.field === 'production_unit_id')).toBe(false);
    expect(page.dashboardUnitLabel()).toBe('Todas las unidades productivas'); expect(page.filters.at(0).disabled).toBe(true);
  });

  it('overrides the unit from presets and preserves the same context when exporting and saving', async () => {
    const page = await createPage();
    const preset: ReportPreset = { id: 1, name: 'Otro contexto', source_key: source.key, definition_version: source.definition_version, configuration: { filters: [{ field: 'production_unit_id', operator: 'eq', value: 3 }, { field: 'poultry_house_id', operator: 'eq', value: 11 }] } };
    page.applyPreset(preset); expect(lastFilters()).toEqual([{ field: 'production_unit_id', operator: 'eq', value: 7 }]);
    page.filters.at(1).controls.value.setValue('12'); page.query(); await page.export('xlsx');
    expect(api.requestExport).toHaveBeenCalledWith(source.key, expect.objectContaining({ filters: [{ field: 'production_unit_id', operator: 'eq', value: 7 }, { field: 'poultry_house_id', operator: 'eq', value: 12 }] }), 'xlsx', expect.any(String));
    api.createPreset.mockReturnValue(of({ data: { ...preset, configuration: page.appliedQuery() } })); page.presetName.setValue('Actual'); await page.savePreset();
    expect(api.createPreset).toHaveBeenCalledWith('Actual', source.key, expect.objectContaining({ filters: expect.arrayContaining([{ field: 'production_unit_id', operator: 'eq', value: 7 }]) }));
  });

  it('waits for the dashboard selection before issuing the first preview', async () => {
    state.set('loading'); await createPage(); expect(api.preview).not.toHaveBeenCalled();
    id.set(3); state.set('ready'); fixture.detectChanges(); await fixture.whenStable();
    expect(lastFilters()).toContainEqual({ field: 'production_unit_id', operator: 'eq', value: 3 });
  });

  it('keeps the creator choices and scopes its result when changing units', async () => {
    const page = await createPage('create'); page.setMode('summary'); page.form.controls.groupings.setValue(['poultry_house']); page.query();
    id.set(3); fixture.detectChanges(); await fixture.whenStable();
    expect(api.preview.mock.lastCall![1]).toEqual(expect.objectContaining({ metrics: ['egg_count'], groupings: ['poultry_house'], filters: [{ field: 'production_unit_id', operator: 'eq', value: 3 }] }));
    expect(page.step()).toBe(4);
  });
  it('refreshes the scope without leaving the creator step that the user is editing', async () => {
    const page = await createPage('create'); page.query(); page.goToStep(2); page.form.controls.columns.setValue(['quantity']);
    id.set(3); fixture.detectChanges(); await fixture.whenStable();
    expect(page.step()).toBe(2); expect(page.form.controls.columns.value).toEqual(['quantity']);
    expect(lastFilters()).toContainEqual({ field: 'production_unit_id', operator: 'eq', value: 3 });
  });
  it('replaces an initial creator request when its dashboard unit changes in flight', async () => {
    const page = await createPage('create'); page.goToStep(3);
    const stale = new Subject<ReportEnvelope<ReportResult>>(); api.preview.mockReturnValueOnce(stale); page.query();
    id.set(3); fixture.detectChanges(); await fixture.whenStable();
    expect(stale.observed).toBe(false); expect(page.step()).toBe(4);
    expect(lastFilters()).toContainEqual({ field: 'production_unit_id', operator: 'eq', value: 3 });
  });
});
