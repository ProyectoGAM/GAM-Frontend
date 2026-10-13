import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { ReportsPage } from './reports.page';
import { ReportingService } from '../services/reporting.service';
import { reportSourceFixture } from '../testing/report-source.fixture';
import { ReportEnvelope, ReportExport, ReportResult } from '../interfaces/report';

describe('Reports page', () => {
  let fixture: ComponentFixture<ReportsPage>;
  const source = reportSourceFixture();
  const user = signal<{ id: number } | null>({ id: 1 });
  const api = { sources: vi.fn(), preview: vi.fn(), options: vi.fn(), exports: vi.fn(), presets: vi.fn(), requestExport: vi.fn(), temporaryLink: vi.fn(), shareLink: vi.fn(), copyLink: vi.fn(), canShareLink: vi.fn(() => true) };
  const result: ReportResult = { source_key: source.key, definition_version: '1.0', columns: ['quantity'], rows: [{ quantity: '20' }], units: { quantity: 'huevos' }, pagination: { current_page: 1, last_page: 1, total: 1, per_page: 50 }, generated_at: '2026-10-12T12:00:00Z' };
  const params = convertToParamMap({});
  const queryParams = convertToParamMap({ source: source.key });
  const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  beforeAll(() => {
    // jsdom has no modal top layer; actual focus/overlay behavior is checked in Chrome.
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
      close: { configurable: true, value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); } },
    });
  });
  afterAll(() => {
    if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
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
  it.each(['pdf', 'xlsx'] as const)('opens the generated %s link in a modal and closes it without changing the report', async format => {
    const page = fixture.componentInstance;
    const item: ReportExport = { id: 41, source_key: source.key, status: 'completed', format, file_name: 'postura.' + format, expires_at: null, failure_message: null };
    const link = { url: 'https://reports.example.test/temporal', expires_at: new Date(Date.now() + 1800000).toISOString() };
    api.temporaryLink.mockReturnValueOnce(of(link)); api.copyLink.mockResolvedValue(undefined); api.shareLink.mockResolvedValue(true);
    page.query(); page.exports.set([item]); page.notice.set('Estamos preparando tu archivo.'); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = Array.from(root.querySelectorAll('button')).find(button => button.textContent?.includes('Compartir con un enlace'))!;
    trigger.click();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable();
    const dialog = root.querySelector('dialog')!;
    expect(api.temporaryLink).toHaveBeenCalledWith(item.id, 30); expect(dialog.open).toBe(true); expect(page.shareTrigger()).toBe(trigger);
    expect(dialog.getAttribute('aria-labelledby')).toBe('share-title');
    expect(dialog.querySelector<HTMLInputElement>('#shared-link')?.value).toBe(link.url);
    expect(dialog.textContent).toContain('Cualquier persona'); expect(dialog.textContent).not.toContain('Estamos preparando');
    Array.from(dialog.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Copiar enlace')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.copyLink).toHaveBeenCalledWith(link.url); expect(api.shareLink).not.toHaveBeenCalled(); expect(dialog.querySelector('[role="status"]')?.textContent).toContain('copiado');
    api.copyLink.mockClear(); dialog.querySelector<HTMLButtonElement>('button[aria-label="Copiar enlace al portapapeles"]')!.click();
    await fixture.whenStable(); fixture.detectChanges(); expect(api.copyLink).toHaveBeenCalledWith(link.url);
    Array.from(dialog.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Compartir')!.click();
    await fixture.whenStable(); fixture.detectChanges(); expect(api.shareLink).toHaveBeenCalledWith(link.url);
    Array.from(dialog.querySelectorAll('button')).find(button => button.textContent?.includes('Cerrar'))!.click();
    fixture.detectChanges(); await fixture.whenStable();
    expect(root.querySelector('dialog')).toBeNull(); expect(page.sharedLink()).toBeNull(); expect(page.shareTrigger()).toBeNull(); expect(page.result()).toEqual(result);
  });
  it('does not show a late share response after the user changes', async () => {
    const pending = new Subject<{ url: string; expires_at: string }>(); api.temporaryLink.mockReturnValueOnce(pending);
    const request = fixture.componentInstance.share({ id: 41 } as ReportExport);
    user.set(null); fixture.detectChanges(); await fixture.whenStable();
    pending.next({ url: 'https://reports.example.test/temporal', expires_at: new Date(Date.now() + 1800000).toISOString() }); await request;
    fixture.detectChanges(); expect(fixture.componentInstance.sharedLink()).toBeNull(); expect((fixture.nativeElement as HTMLElement).querySelector('dialog')).toBeNull();
  });
  it('updates the duration without closing the modal and ignores responses after it is dismissed', async () => {
    const page = fixture.componentInstance; const first = { url: 'https://reports.example.test/short', expires_at: new Date(Date.now() + 1800000).toISOString() };
    api.temporaryLink.mockReturnValueOnce(of(first));
    await page.share({ id: 41 } as ReportExport); fixture.detectChanges(); await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement; const dialog = root.querySelector('dialog')!;
    const select = dialog.querySelector<HTMLSelectElement>('#share-duration')!;
    expect(Array.from(select.options, option => option.value)).toEqual(['30', '60', '360', '720', '1440', '10080', '43200']);
    const pending = new Subject<{ url: string; expires_at: string }>(); api.temporaryLink.mockReturnValueOnce(pending);
    select.value = '43200'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(api.temporaryLink).toHaveBeenLastCalledWith(41, 43200); expect(select.disabled).toBe(true);
    expect(dialog.querySelector<HTMLInputElement>('#shared-link')?.value).toBe('');
    expect(dialog.querySelector<HTMLButtonElement>('.clipboard-button')?.disabled).toBe(true);
    pending.next({ url: 'https://reports.example.test/long', expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
    await fixture.whenStable(); fixture.detectChanges();
    expect(root.querySelector('dialog')).toBe(dialog); expect(page.sharedLink()?.url).toContain('/long'); expect(select.disabled).toBe(false);
    const late = new Subject<{ url: string; expires_at: string }>(); api.temporaryLink.mockReturnValueOnce(late);
    const request = page.updateShareDuration(10080); page.dismissShare(); fixture.detectChanges();
    late.next(first); await request; fixture.detectChanges(); expect(page.sharedLink()).toBeNull(); expect(root.querySelector('dialog')).toBeNull();
  });
  it('preserves the previous link and duration when changing its duration fails', async () => {
    const page = fixture.componentInstance; const link = { url: 'https://reports.example.test/short', expires_at: new Date(Date.now() + 1800000).toISOString() };
    api.temporaryLink.mockReturnValueOnce(of(link)); await page.share({ id: 41 } as ReportExport);
    const pending = new Subject<{ url: string; expires_at: string }>(); api.temporaryLink.mockReturnValueOnce(pending);
    const request = page.updateShareDuration(43200); pending.error(new HttpErrorResponse({ status: 409 })); await request;
    expect(page.sharedLink()).toEqual(link); expect(page.shareDuration()).toBe(30); expect(page.error()).toContain('Se mantiene el enlace anterior'); expect(page.linkBusy()).toBe(false);
  });
});
