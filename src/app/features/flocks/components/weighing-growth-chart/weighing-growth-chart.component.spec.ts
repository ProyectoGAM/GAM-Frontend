import { TestBed } from '@angular/core/testing';

import { DailyWeighing } from '../../interfaces/flock-weighing.interface';
import { dailyWeighingGrowth } from './daily-weighing-growth';
import { WeighingGrowthChartComponent } from './weighing-growth-chart.component';

const day: DailyWeighing = {
  id: 'daily-1', flock_id: 'flock-1', date: '2026-10-09', status: 'in_progress',
  expected_range: { stage: 'chick', min_weight_g: '75', max_weight_g: '125', reference_version: 1, unit: 'g' },
  version: 1, represented_bird_count: 12, total_weight_g: '1170', average_weight_g: '97.5',
  anomalous_entry_count: 1, last_entry: { id: 'group-1', occurred_at: '2026-10-09T12:00:00Z',
    mode: 'group', bird_count: 10, total_weight_g: '1000', weight_g: null, average_weight_g: '100', outside_expected_range: false },
};

describe('daily weighing growth', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [WeighingGrowthChartComponent] }));

  it('uses the weighted daily average including groups and chronological time spacing', () => {
    const points = dailyWeighingGrowth([day, { ...day, id: 'older', date: '2026-10-02', average_weight_g: '75' }]);
    expect(points.map((point) => point.average)).toEqual([75, 97.5]);
    expect(points[1].timestamp - points[0].timestamp).toBe(7 * 86_400_000);
    expect(points[1].birds).toBe(12);
    expect(points[1].inProgress).toBe(true);
    expect(points[1].outside).toBe(false); // An anomalous entry does not imply an anomalous daily mean.
  });

  it('classifies each daily mean against its own saved range, including boundary values', () => {
    const points = dailyWeighingGrowth([75, 125, 74.9, 125.1].map((weight, i) => ({ ...day,
      id: String(i), date: `2026-10-0${i + 1}`, average_weight_g: String(weight) })));
    expect(points.map((point) => point.outside)).toEqual([false, false, true, true]);
    const changed = dailyWeighingGrowth([{ ...day, average_weight_g: '140', expected_range: {
      ...day.expected_range!, min_weight_g: '130', max_weight_g: '150' } }])[0];
    expect(changed.range).toEqual({ min: 130, max: 150 });
    expect(changed.outside).toBe(false);
  });

  it('excludes empty days and invalid measurements without inventing values for missing dates or ranges', () => {
    const points = dailyWeighingGrowth([
      { ...day, represented_bird_count: 0, average_weight_g: null },
      { ...day, average_weight_g: 'NaN' }, { ...day, date: '2026-02-30' },
      { ...day, expected_range: null },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].range).toBeNull();
    expect(points[0].outside).toBe(false);
    expect(dailyWeighingGrowth([])).toEqual([]);
  });

  it('shows an empty period, then a single-date notice and its real latest average', () => {
    const fixture = TestBed.createComponent(WeighingGrowthChartComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin registros de pesaje en este período');
    fixture.componentRef.setInput('days', [day]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Hay un solo pesaje diario');
    expect(fixture.nativeElement.querySelector('.latest').textContent).toContain('97,5 g/ave');
    expect(fixture.nativeElement.querySelector('.latest').textContent).toContain('12 aves');
    fixture.componentRef.setInput('days', [day, { ...day, id: 'newer', date: '2026-10-10', average_weight_g: '130' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Hay un solo pesaje diario');
    expect(fixture.nativeElement.querySelector('.latest.anomalous').textContent).toContain('130 g/ave');
    expect(fixture.nativeElement.querySelector('.latest.anomalous').textContent).toContain('Fuera del rango esperado');
  });
});
