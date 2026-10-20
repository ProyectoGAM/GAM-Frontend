import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NEVER, of, Subject, throwError } from 'rxjs';

import { BreedWeighingSettings, DailyWeighingDetail, DailyWeighingEntry } from '../../interfaces/flock-weighing.interface';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockWeighingsService } from '../../services/flock-weighings.service';
import { FlockWeighingsPage } from './flock-weighings.page';

const entries: DailyWeighingEntry[] = [
  { id: 'bird-1', occurred_at: '2026-10-08T12:00:00Z', mode: 'individual', weight_g: '80',
    bird_count: 1, total_weight_g: '80', average_weight_g: '80', outside_expected_range: false },
  { id: 'bird-2', occurred_at: '2026-10-08T12:01:00Z', mode: 'individual', weight_g: '90',
    bird_count: 1, total_weight_g: '90', average_weight_g: '90', outside_expected_range: false },
  { id: 'group-1', occurred_at: '2026-10-08T12:02:00Z', mode: 'group', weight_g: null,
    bird_count: 10, total_weight_g: '1000', average_weight_g: '100', outside_expected_range: false },
];

const day: DailyWeighingDetail = {
  id: 'day-1', flock_id: 'flock-1', date: '2026-10-08', status: 'closed',
  expected_range: { stage: 'chick', min_weight_g: '65', max_weight_g: '95', unit: 'g', reference_version: 1 },
  version: 1, represented_bird_count: 12, total_weight_g: '1170', average_weight_g: '97.5',
  anomalous_entry_count: 0, last_entry: null, entries, next_cursor: null,
};

const breed: BreedWeighingSettings = {
  id: 7, name: 'Hy-Line Brown', status: 'inactive', version: 4,
  range_overrides: { chick_min_weight_g: null, chick_max_weight_g: null, adult_min_weight_g: '1500', adult_max_weight_g: '2100' },
  expected_ranges: { adult_from_week: 10, reference_version: 3,
    chick: { min_weight_g: '50', max_weight_g: '100', source: 'global' },
    adult: { min_weight_g: '1500', max_weight_g: '2100', source: 'breed' } },
};

describe('flock weighing summary', () => {
  const addEntry = vi.fn(() => NEVER);
  const dailyEvolution = vi.fn<FlockWeighingsService['dailyEvolution']>(() => of([day]));
  const breedSettings = vi.fn(() => of(breed));
  const saveBreedSettings = vi.fn<FlockWeighingsService['saveBreedSettings']>(() => NEVER);
  beforeEach(() => TestBed.configureTestingModule({
    imports: [FlockWeighingsPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: NEVER } },
      { provide: FlockDetailService, useValue: {} },
      { provide: FlockWeighingsService, useValue: { addDailyEntry: addEntry, breedSettings, saveBreedSettings, dailyEvolution } },
    ],
  }));
  afterEach(() => { addEntry.mockReset(); breedSettings.mockReset(); breedSettings.mockReturnValue(of(breed)); saveBreedSettings.mockReset();
    dailyEvolution.mockReset(); dailyEvolution.mockReturnValue(of([day])); });

  it('switches between growth and the existing distribution without losing the selected date', () => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    const page = fixture.componentInstance;
    page.flockState.set('ready'); page.historyState.set('ready'); page.days.set([day]);
    page.flockId.set('flock-1'); page.selectedId.set(day.id); page.selectedDetail.set(day); page.selectedState.set('ready');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#summary-tab').textContent).toBe('Gráficas');
    const buttons = fixture.nativeElement.querySelectorAll('.chart-switch button') as NodeListOf<HTMLButtonElement>;
    buttons[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-weighing-growth-chart')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-weighing-distribution-chart')).toBeNull();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(dailyEvolution).toHaveBeenCalledTimes(1);
    buttons[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-weighing-distribution-chart')).not.toBeNull();
    expect(page.selectedId()).toBe(day.id);
    expect(page.selectedDetail()).toBe(day);
    expect(fixture.nativeElement.querySelector('select')?.value).toBe(day.id);
  });

  it('ignores outdated evolution responses after a period change and allows retry after a failed request', () => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    const page = fixture.componentInstance;
    const delayed = new Subject<DailyWeighingDetail[]>();
    dailyEvolution.mockReturnValueOnce(delayed);
    page.flockId.set('flock-1');
    page.setChartView('evolution');
    page.setEvolutionPeriod('all');
    expect(dailyEvolution.mock.calls[1][1]).toBeNull();
    delayed.next([{ ...day, average_weight_g: '999' }]);
    expect(page.evolutionDays()[0].average_weight_g).toBe(day.average_weight_g);
    dailyEvolution.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    page.setEvolutionPeriod('30');
    expect(page.evolutionState()).toBe('offline');
    expect(page.evolutionDays()).toEqual([]);
    page.loadEvolution();
    expect(page.evolutionState()).toBe('ready');
  });

  const editor = () => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    fixture.componentInstance.selectedDetail.set({ ...day,
      expected_range: { ...day.expected_range!, breed_id: 7, source: 'breed', breed_version: 2 } });
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog[aria-labelledby="settings-title"]') as HTMLDialogElement;
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();
    fixture.componentInstance.openSettings();
    fixture.detectChanges();
    return fixture;
  };

  it('prefers breed ranges, fills missing stages from global values and saves explicit breed ranges', () => {
    const fixture = editor();
    const page = fixture.componentInstance;
    expect(breedSettings).toHaveBeenCalledWith(7);
    expect(fixture.nativeElement.querySelector('.breed-context').textContent).toContain('Hy-Line Brown');
    expect(page.settingsForm.controls.chick_min_weight.enabled).toBe(true);
    expect(page.settingsForm.controls.chick_min_weight.value).toBe('50');
    expect(page.settingsForm.controls.chick_max_weight.value).toBe('100');
    expect(page.settingsForm.controls.adult_min_weight.enabled).toBe(true);
    expect(page.settingsForm.controls.adult_min_weight.value).toBe('1500');
    expect(fixture.nativeElement.querySelector('dialog[aria-labelledby="settings-title"] input[type="checkbox"]')).toBeNull();
    page.settingsForm.controls.adult_max_weight.setValue('2200');
    page.saveSettings();
    expect(saveBreedSettings).toHaveBeenCalledWith(7, {
      version: 4, chick_min_weight_g: '50', chick_max_weight_g: '100',
      adult_min_weight_g: '1500', adult_max_weight_g: '2200',
    }, expect.any(String));
  });

  it.each([true, false])('opens the current breed from the entry tab with a daily weighing present: %s', (hasDailyWeighing) => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    const page = fixture.componentInstance;
    page.flockState.set('ready');
    page.flock.set({ id: 'flock-1', code: 'LOT-1', breed_id: 7, supplier_id: null, supplier_name: null,
      origin: null, poultry_house_id: 1, production_unit_id: 1, initial_quantity: 100, current_quantity: 100,
      entry_date: '2026-10-01', established_at: '2026-10-01', age_days: 7, current_week: 1,
      is_grouped: false, status: 'active', version: 1, notes: null, finalized_at: null, finalization_reason: null });
    page.selectedDetail.set({ ...day, expected_range: { ...day.expected_range!, breed_id: 9 } });
    page.tab.set('entry');
    page.todayState.set('ready');
    page.today.set(hasDailyWeighing ? { ...day, expected_range: { ...day.expected_range!, breed_id: 7 } } : null);
    page.individualWeight.setValue('80');
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog[aria-labelledby="settings-title"]') as HTMLDialogElement;
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();
    const button = fixture.nativeElement.querySelector('#entry-panel .edit-button') as HTMLButtonElement;
    expect(button.textContent).toContain('Editar rango');
    button.click();
    fixture.detectChanges();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(breedSettings).toHaveBeenCalledWith(7);
    expect(fixture.nativeElement.querySelector('.breed-context').textContent).toContain('Hy-Line Brown');
    page.closeSettings();
    expect(page.tab()).toBe('entry');
    expect(page.individualWeight.value).toBe('80');
  });

  it('validates both editable stage ranges before saving', () => {
    const fixture = editor();
    const page = fixture.componentInstance;
    page.settingsForm.controls.chick_min_weight.setValue('120');
    page.saveSettings();
    expect(saveBreedSettings).not.toHaveBeenCalled();
    expect(page.settingsError()).toContain('mínimo');
    page.settingsForm.controls.chick_min_weight.setValue('60');
    page.saveSettings();
    expect(saveBreedSettings).toHaveBeenCalledWith(7, expect.objectContaining({
      chick_min_weight_g: '60', chick_max_weight_g: '100', adult_min_weight_g: '1500', adult_max_weight_g: '2100',
    }), expect.any(String));
  });

  it('uses global defaults for a zero range and leaves fields empty when no defaults exist', () => {
    breedSettings.mockReturnValueOnce(of({ ...breed,
      range_overrides: { ...breed.range_overrides, chick_min_weight_g: '0.0', chick_max_weight_g: '0.0' } }));
    const fixture = editor();
    const page = fixture.componentInstance;
    expect(page.settingsForm.controls.chick_min_weight.value).toBe('50');
    expect(page.settingsForm.controls.chick_max_weight.value).toBe('100');
    breedSettings.mockReturnValueOnce(of({ ...breed, expected_ranges: null }));
    page.loadSettings(7);
    expect(page.settingsForm.controls.chick_min_weight.value).toBe('');
    expect(page.settingsForm.controls.adult_min_weight.value).toBe('1500');
    page.saveSettings();
    expect(saveBreedSettings).not.toHaveBeenCalled();
  });

  it('keeps the editor blocked on load errors and ignores a late response after closing', () => {
    breedSettings.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    const fixture = editor();
    const page = fixture.componentInstance;
    expect(page.settingsError()).toContain('permiso');
    page.saveSettings();
    expect(saveBreedSettings).not.toHaveBeenCalled();
    const delayed = new Subject<BreedWeighingSettings>();
    breedSettings.mockReturnValueOnce(delayed);
    page.openSettings();
    page.closeSettings();
    delayed.next(breed);
    expect(page.settings()).toBeNull();
  });

  it('reuses a failed save key and blocks resaving a stale breed version', () => {
    const page = editor().componentInstance;
    saveBreedSettings.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    saveBreedSettings.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    page.saveSettings();
    const key = saveBreedSettings.mock.calls[0][2];
    page.saveSettings();
    expect(saveBreedSettings.mock.calls[1][2]).toBe(key);
    expect(page.settingsError()).toContain('versión actual');
    page.saveSettings();
    expect(saveBreedSettings).toHaveBeenCalledTimes(2);
  });

  it('shows individual sample metrics in the summary and updates them with the selected detail', () => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    const page = fixture.componentInstance;
    page.flockState.set('ready');
    page.historyState.set('ready');
    page.days.set([day]);
    page.selectedId.set(day.id);
    page.selectedDetail.set(day);
    page.selectedState.set('ready');
    fixture.detectChanges();

    const summary = fixture.nativeElement.querySelector('.metrics-card') as HTMLElement;
    const sample = summary.querySelector('.sample-metrics') as HTMLElement;
    expect(sample.textContent).toContain('Aves de la muestra individual');
    expect(sample.textContent).toContain('Media individual (μ)');
    expect(sample.textContent).toContain('85 g');
    expect(sample.textContent).toContain('Desviación muestral (s)');
    expect(sample.textContent).toContain('7,1 g');
    expect(sample.textContent).toContain('Uniformidad de la muestra ±10 %');
    expect(sample.textContent).toContain('100 %');
    expect(fixture.nativeElement.querySelector('.chart-card')?.textContent).not.toContain('Media individual (μ)');

    page.selectedDetail.set({ ...day, entries: [entries[2]] });
    fixture.detectChanges();
    const updated = (fixture.nativeElement.querySelector('.sample-metrics') as HTMLElement).textContent;
    expect(updated).toContain('Aves de la muestra individual');
    expect(updated).toContain('Sin registros');
  });

  it('counts individual anomalies separately from anomalous group entries', () => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    const page = fixture.componentInstance;
    page.flockState.set('ready');
    page.historyState.set('ready');
    page.days.set([{ ...day, anomalous_entry_count: 3 }]);
    page.selectedId.set(day.id);
    page.selectedState.set('ready');
    page.selectedDetail.set({ ...day, entries: [
      ...entries, { ...entries[0], id: 'confirmed-outlier', weight_g: '120', outside_expected_range: true },
      { ...entries[2], id: 'anomalous-group', outside_expected_range: true },
      { ...entries[2], id: 'second-anomalous-group', bird_count: 50, outside_expected_range: true },
    ] });
    expect(page.individualAnomalies()).toBe(1);
    expect(page.groupAnomalies()).toBe(2);
    expect(page.individualSummary()?.n).toBe(3);
    expect(page.individualSummary()?.mean).toBeCloseTo(290 / 3);
    fixture.detectChanges();
    const summary = fixture.nativeElement.querySelector('.anomalies').textContent;
    expect(summary).toContain('Individuales confirmados: 1');
    expect(summary).toContain('Grupales confirmados: 2');
    page.selectedDetail.set(day);
    fixture.detectChanges();
    expect(page.groupAnomalies()).toBe(0);
    expect(fixture.nativeElement.querySelector('.anomalies').textContent).toContain('Grupales confirmados: 0');
    page.selectedState.set('loading');
    expect(page.groupAnomalies()).toBeNull();
  });

  it.each(['individual', 'group'] as const)('keeps a pending %s anomaly out of the sample and discards it on cancellation', (mode) => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    page.todayState.set('ready');
    const dialog = fixture.nativeElement.querySelector('dialog[aria-labelledby="anomaly-title"]') as HTMLDialogElement;
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();
    page.selectedState.set('ready');
    page.selectedDetail.set(day);
    page.entryMode.set(mode);
    page.individualWeight.setValue('120');
    page.groupCount.setValue('10');
    page.groupTotal.setValue('1200');
    addEntry.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409,
      error: { code: 'DAILY_WEIGHING_OUT_OF_RANGE_CONFIRMATION_REQUIRED', meta: { min_weight_g: '65', max_weight_g: '95' } } })));
    page.submitEntry();
    fixture.detectChanges();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.querySelector('.anomaly-range')?.textContent).toContain('65–95 g');
    expect(page.entryAttempt()).not.toBeNull();
    expect(page.individualSummary()?.n).toBe(2);
    expect(page.individualAnomalies()).toBe(0);
    page.cancelAnomaly();
    expect(page.entryAttempt()).toBeNull();
    expect(page.anomalyRange()).toBeNull();
    expect(addEntry).toHaveBeenCalledTimes(1);
    page.confirmAnomaly();
    expect(addEntry).toHaveBeenCalledTimes(1);
  });

  it('uses the current day range when confirmation metadata is missing and never uses a historic selection', () => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog[aria-labelledby="anomaly-title"]') as HTMLDialogElement;
    dialog.showModal = vi.fn();
    page.todayState.set('ready');
    page.today.set({ ...day, expected_range: { ...day.expected_range!, min_weight_g: '10', max_weight_g: '100' } });
    page.selectedDetail.set(day);
    page.individualWeight.setValue('120');
    addEntry.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409,
      error: { code: 'DAILY_WEIGHING_OUT_OF_RANGE_CONFIRMATION_REQUIRED' } })));
    page.submitEntry();
    expect(page.anomalyRange()).toBe('10–100 g');
    page.today.set(null);
    addEntry.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409,
      error: { code: 'DAILY_WEIGHING_OUT_OF_RANGE_CONFIRMATION_REQUIRED', meta: { min_weight_g: 'invalid', max_weight_g: '100' } } })));
    page.submitEntry();
    fixture.detectChanges();
    expect(dialog.querySelector('.anomaly-range')?.textContent).toContain('Dato no disponible');
  });

  it.each(['individual', 'group'] as const)('confirms an anomalous %s entry using the original payload and idempotency key', (mode) => {
    const fixture = TestBed.createComponent(FlockWeighingsPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    page.todayState.set('ready');
    const dialog = fixture.nativeElement.querySelector('dialog[aria-labelledby="anomaly-title"]') as HTMLDialogElement;
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();
    page.entryMode.set(mode);
    page.individualWeight.setValue('120');
    page.groupCount.setValue('10');
    page.groupTotal.setValue('1200');
    addEntry.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409,
      error: { code: 'DAILY_WEIGHING_OUT_OF_RANGE_CONFIRMATION_REQUIRED' } })));
    addEntry.mockReturnValueOnce(NEVER);
    page.submitEntry();
    const attempt = page.entryAttempt()!;
    page.confirmAnomaly();
    expect(addEntry).toHaveBeenLastCalledWith(page.flockId(), { ...attempt.payload, confirm_out_of_range: true }, attempt.key);
  });
});
