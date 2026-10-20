import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { reportingRoutes } from '../reporting.routes';
import { ReportingService } from '../services/reporting.service';
import { reportSourceFixture } from '../testing/report-source.fixture';
import { ReportsPage } from './reports.page';

describe('Report navigation', () => {
  const source = reportSourceFixture();
  source.capabilities.presets = true;
  const configuration = { columns: ['quantity'], metrics: ['egg_count'], groupings: ['poultry_house'] };
  const preset = { id: 91, name: 'Mi postura', source_key: source.key, definition_version: source.definition_version, configuration };
  const result = { source_key: source.key, definition_version: source.definition_version, columns: ['poultry_house', 'egg_count'], rows: [{ poultry_house: 'Galpón norte', egg_count: '400' }], units: {}, pagination: { current_page: 1, last_page: 1, total: 1, per_page: 50 }, generated_at: '2026-10-12T12:00:00Z' };
  const api = { sources: vi.fn(), presets: vi.fn(), preset: vi.fn(), exports: vi.fn(), options: vi.fn(), preview: vi.fn() };
  const user = signal<{ id: number } | null>({ id: 1 });
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    vi.clearAllMocks();
    user.set({ id: 1 });
    api.sources.mockReturnValue(of({ data: [source] }));
    api.presets.mockReturnValue(of({ data: [preset], meta: { current_page: 1, last_page: 1 } }));
    api.preset.mockReturnValue(of({ data: preset }));
    api.exports.mockReturnValue(of({ data: [], meta: { current_page: 1, last_page: 1 } }));
    api.options.mockReturnValue(of({ data: [], pagination: { current_page: 1, last_page: 1, total: 0 } }));
    api.preview.mockReturnValue(of({ data: result }));
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'administracion/reportes/reportes', children: reportingRoutes }]), { provide: AuthStore, useValue: { user } }, { provide: ReportingService, useValue: api }] });
    harness = await RouterTestingHarness.create();
  });

  it('shows business topics without loading queries or mixing saved reports and files into the home', async () => {
    await harness.navigateByUrl('/administracion/reportes/reportes', ReportsPage); await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.textContent).toContain('Producción y lotes');
    expect(root.querySelector('form')).toBeNull(); expect(root.querySelector('table')).toBeNull();
    expect(api.preview).not.toHaveBeenCalled(); expect(api.presets).not.toHaveBeenCalled(); expect(api.exports).not.toHaveBeenCalled();
    await harness.navigateByUrl('/administracion/reportes/reportes/temas/produccion', ReportsPage); await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Postura');
    const creator = await harness.navigateByUrl('/administracion/reportes/reportes/crear', ReportsPage); await harness.fixture.whenStable(); harness.detectChanges();
    expect(creator.step()).toBe(1); expect(harness.routeNativeElement!.textContent).toContain('Elegir tema');
    expect(harness.routeNativeElement!.querySelector('app-report-field-picker')).toBeNull();
  });

  it('opens an existing saved report directly and restores its summary for editing', async () => {
    const page = await harness.navigateByUrl('/administracion/reportes/reportes/ver/lots.egg-production?guardado=91', ReportsPage); await harness.fixture.whenStable(); harness.detectChanges();
    expect(api.preset).toHaveBeenCalledWith(91); expect(page.selectedPreset()?.name).toBe('Mi postura');
    expect(api.preview).toHaveBeenCalledWith(source.key, expect.objectContaining(configuration));
    const editor = await harness.navigateByUrl('/administracion/reportes/reportes/crear?source=lots.egg-production&guardado=91', ReportsPage); await harness.fixture.whenStable(); harness.detectChanges();
    expect(editor.step()).toBe(2); expect(editor.reportMode()).toBe('summary'); expect(editor.form.controls.groupings.value).toEqual(['poultry_house']);
    expect(harness.routeNativeElement!.querySelector('table')).toBeNull();
  });

  it('loads the saved library and downloadable files only in their own pages', async () => {
    await harness.navigateByUrl('/administracion/reportes/reportes/guardados', ReportsPage); await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Mi postura'); expect(api.exports).not.toHaveBeenCalled();
    await harness.navigateByUrl('/administracion/reportes/reportes/archivos', ReportsPage); await harness.fixture.whenStable(); harness.detectChanges();
    expect(api.exports).toHaveBeenCalledWith(1); expect(harness.routeNativeElement!.textContent).toContain('Todavía no tienes reportes exportados');
  });
  it('carries the current query into customization and clears it when the user changes', async () => {
    await TestBed.inject(Router).navigateByUrl('/administracion/reportes/reportes/crear?source=lots.egg-production', { state: { actorId: 1, sourceKey: source.key, configuration: { ...configuration, from: '2026-10-01' } } });
    await harness.fixture.whenStable(); harness.detectChanges();
    const editor = harness.routeDebugElement!.componentInstance as ReportsPage;
    expect(editor.reportMode()).toBe('summary'); expect(editor.form.controls.from.value).toBe('2026-10-01');
    user.set({ id: 2 }); harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges();
    expect(editor.form.controls.from.value).toBe(''); expect(editor.form.controls.metrics.value).toEqual([]);
  });
});
