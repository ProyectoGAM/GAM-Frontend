import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { ReportsPage } from './reports.page';
import { ReportingService } from '../services/reporting.service';
import { reportSourceFixture } from '../testing/report-source.fixture';
import { ReportEnvelope, ReportResult } from '../interfaces/report';

describe('Reports page', () => {
  let fixture: ComponentFixture<ReportsPage>;
  const source = reportSourceFixture();
  const user = signal<{ id: number } | null>({ id: 1 });
  const api = { sources: vi.fn(), preview: vi.fn(), options: vi.fn(), exports: vi.fn(), presets: vi.fn(), requestExport: vi.fn() };
  const result: ReportResult = { source_key: source.key, definition_version: '1.0', columns: ['quantity'], rows: [{ quantity: '20' }], units: { quantity: 'huevos' }, pagination: { current_page: 1, last_page: 1, total: 1, per_page: 50 }, generated_at: '2026-10-12T12:00:00Z' };
  const params = convertToParamMap({});
  const queryParams = convertToParamMap({ source: source.key });
  beforeEach(async () => {
    vi.clearAllMocks(); user.set({ id: 1 }); api.sources.mockReturnValue(of({ data: [source] })); api.options.mockReturnValue(of({ data: [], pagination: { current_page: 1, last_page: 1, total: 0 } })); api.exports.mockReturnValue(of({ data: [], meta: { current_page: 1, last_page: 1 } })); api.preview.mockReturnValue(of({ data: result }));
    await TestBed.configureTestingModule({ imports: [ReportsPage], providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { data: { screen: 'create' }, paramMap: params, queryParamMap: queryParams }, paramMap: of(params), queryParamMap: of(queryParams) } }, { provide: AuthStore, useValue: { user } }, { provide: ReportingService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(ReportsPage); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  it('renders the report and exposes server results after consultation', async () => {
    fixture.componentInstance.query(); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Postura'); expect(fixture.componentInstance.result()?.rows).toEqual([{ quantity: '20' }]);
  });
  it('cancels stale previews instead of replacing current results', () => {
    const stale = new Subject<ReportEnvelope<ReportResult>>(); const current = new Subject<ReportEnvelope<ReportResult>>();
    api.preview.mockReturnValueOnce(stale).mockReturnValueOnce(current);
    fixture.componentInstance.query(); fixture.componentInstance.query();
    expect(stale.observed).toBe(false); current.next({ data: result }); stale.next({ data: { ...result, rows: [{ quantity: '999' }] } });
    expect(fixture.componentInstance.result()?.rows[0]['quantity']).toBe('20');
  });
  it('preserves the applied query and valid result when a new query fails', () => {
    fixture.componentInstance.query(); const applied = fixture.componentInstance.appliedQuery();
    const next = new Subject<ReportEnvelope<ReportResult>>(); api.preview.mockReturnValueOnce(next);
    fixture.componentInstance.form.controls.from.setValue('2026-10-01'); fixture.componentInstance.query(); next.error(new HttpErrorResponse({ status: 422, error: { errors: { from: ['Fecha inválida.'] } } }));
    expect(fixture.componentInstance.appliedQuery()).toEqual(applied); expect(fixture.componentInstance.result()).toEqual(result); expect(fixture.componentInstance.error()).toContain('Fecha inválida'); expect(fixture.componentInstance.pendingChanges()).toBe(true);
  });
  it('clears private results when the shared employee changes', async () => {
    fixture.componentInstance.query(); user.set(null); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.result()).toBeNull(); expect(fixture.componentInstance.exports()).toEqual([]); expect(fixture.componentInstance.sharedLink()).toBeNull();
  });
  it('keeps each creation step focused and preserves checked columns when going back', async () => {
    const page = fixture.componentInstance;
    page.chooseSource(source.key); fixture.detectChanges(); await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('select[multiple]')).toBeNull();
    expect(root.querySelector('#date-from')).toBeNull();
    const quantity = Array.from(root.querySelectorAll<HTMLLabelElement>('app-report-field-picker label')).find(label => label.textContent?.includes('Huevos'))!;
    quantity.querySelector<HTMLInputElement>('input')!.click();
    expect(page.form.controls.columns.value).toEqual(['poultry_house']);
    page.nextStep(); fixture.detectChanges(); await fixture.whenStable();
    expect(root.querySelector('#date-from')).not.toBeNull();
    expect(root.querySelector('app-report-field-picker')).toBeNull();
    page.goToStep(2); fixture.detectChanges();
    expect(page.form.controls.columns.value).toEqual(['poultry_house']);
  });
  it('prevents empty reports and submits a summary independently from detail columns', () => {
    const page = fixture.componentInstance; page.chooseSource(source.key); page.form.controls.columns.setValue([]); page.nextStep();
    expect(page.step()).toBe(2); expect(page.error()).toContain('al menos un dato');
    page.setMode('summary'); page.form.controls.groupings.setValue(['poultry_house']); page.nextStep(); page.query();
    expect(api.preview).toHaveBeenLastCalledWith(source.key, expect.objectContaining({ groupings: ['poultry_house'], metrics: ['egg_count'] }));
    expect(page.step()).toBe(4);
    page.setMode('detail'); expect(page.form.controls.metrics.value).toEqual([]); expect(page.form.controls.groupings.value).toEqual([]);
  });
});
