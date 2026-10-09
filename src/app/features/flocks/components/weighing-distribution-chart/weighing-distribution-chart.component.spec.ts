import { TestBed } from '@angular/core/testing';

import { DailyWeighing, DailyWeighingEntry } from '../../interfaces/flock-weighing.interface';
import { dailyWeighingDistribution, normalWeightDensity } from './daily-weighing-distribution';
import { WeighingDistributionChartComponent } from './weighing-distribution-chart.component';

const weighing: DailyWeighing = {
  id: 'one', flock_id: 'flock-1', date: '2026-10-07', status: 'closed',
  expected_range: { stage: 'chick', min_weight_g: '65', max_weight_g: '95', unit: 'g', reference_version: 1 },
  version: 1, represented_bird_count: 6, total_weight_g: '527', average_weight_g: '87.833',
  anomalous_entry_count: 1, last_entry: null,
};
const individual = (id: string, weight: string | null, outside = false): DailyWeighingEntry => ({
  id, occurred_at: '2026-10-07T12:00:00Z', mode: 'individual', weight_g: weight,
  bird_count: 1, total_weight_g: weight ?? '0', average_weight_g: weight ?? '0', outside_expected_range: outside,
});
const group = (id: string, count: number, total: string): DailyWeighingEntry => ({
  id, occurred_at: '2026-10-07T12:03:00Z', mode: 'group', weight_g: null,
  bird_count: count, total_weight_g: total, average_weight_g: String(Number(total) / count),
  outside_expected_range: false,
});
const sample = [individual('a', '80'), individual('b', '82'), individual('c', '110', true)];

const render = (entries: DailyWeighingEntry[], selectedWeighing = weighing) => {
  const fixture = TestBed.createComponent(WeighingDistributionChartComponent);
  fixture.componentRef.setInput('weighing', selectedWeighing);
  fixture.componentRef.setInput('entries', entries);
  fixture.detectChanges();
  return fixture;
};

describe('individual weight distribution', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [WeighingDistributionChartComponent] }));

  it('derives all metrics and observed frequencies from individual birds only', () => {
    const distribution = dailyWeighingDistribution(sample);
    expect(distribution.n).toBe(3);
    expect(distribution.mean).toBeCloseTo((80 + 82 + 110) / 3);
    expect(distribution.sample_stddev).toBeCloseTo(Math.sqrt(844 / 3), 4);
    expect(distribution.uniformity_percent).toBeCloseTo(100 / 3);
    expect(distribution.minimum).toBe(80);
    expect(distribution.maximum).toBe(110);
    expect(distribution.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
    expect(distribution.bins.reduce((sum, bin) => sum + bin.anomalous, 0)).toBe(1);
    expect(distribution.curve).not.toBeNull();
    const fixture = render(sample);
    const histogram = fixture.componentInstance.histogram();
    expect(histogram?.bars.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
    expect(histogram?.curve.length).toBe(121);
    expect(histogram?.curve.every((point) => Number.isFinite(point[1]))).toBe(true);
    expect(histogram?.expectedRange).toEqual({ min: 65, max: 95 });
    expect(histogram?.binWidth).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Intervalos de 2 g');
    expect(fixture.nativeElement.textContent).toContain('Límites del rango esperado');
    expect(fixture.nativeElement.textContent).not.toContain('Aves de la muestra individual');
    expect(fixture.nativeElement.textContent).not.toContain('Media individual (μ)');
    expect(fixture.nativeElement.textContent).not.toContain('Mínimo observado');
    expect(fixture.nativeElement.textContent).not.toContain('Máximo observado');
    expect(fixture.nativeElement.textContent).not.toContain('Las columnas cuentan aves');
    expect(fixture.nativeElement.textContent).not.toContain('Los ingresos grupales permanecen');
  });

  it('keeps a group-only session empty even when ten groups could form a separate distribution', () => {
    const groups = Array.from({ length: 100 }, (_, index) => group(`g${index}`, 50, String(5000 + index * 100)));
    const distribution = dailyWeighingDistribution(groups);
    expect(distribution).toMatchObject({ available: false, n: 0, mean: null, sample_stddev: null, bins: [], curve: null });
    const fixture = render(groups);
    expect(fixture.nativeElement.textContent).toContain('La distribución requiere pesajes individuales');
    expect(fixture.nativeElement.querySelector('.chart-wrap')?.hasAttribute('hidden')).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Distribución de promedios grupales');
  });

  it('is unchanged when group records are added, changed or removed', () => {
    const baseline = dailyWeighingDistribution(sample);
    const baselineChart = render(sample).componentInstance.histogram();
    const groups = [group('g1', 50, '5000'), group('g2', 500, '200000')];
    expect(dailyWeighingDistribution([...sample, ...groups])).toEqual(baseline);
    expect(dailyWeighingDistribution([...sample, { ...groups[0], total_weight_g: '999999' }, groups[1]])).toEqual(baseline);
    expect(dailyWeighingDistribution([...sample, groups[1]])).toEqual(baseline);
    expect(render([...sample, ...groups]).componentInstance.histogram()).toEqual(baselineChart);
  });

  it('changes bin frequencies but not statistics when the interval width changes', () => {
    const narrow = dailyWeighingDistribution(sample, { binWidth: 2 });
    const wide = dailyWeighingDistribution(sample, { binWidth: 20 });
    expect(narrow.bins).not.toEqual(wide.bins);
    expect(narrow.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
    expect(wide.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
    for (const key of ['n', 'mean', 'sample_stddev', 'uniformity_percent', 'minimum', 'maximum'] as const) {
      expect(narrow[key]).toBe(wide[key]);
    }
  });

  it('scales whole-gram intervals from the expected range, independent of anomalies or sample size', () => {
    const cases = [
      { min: 10, max: 100, width: 5 },
      { min: 65, max: 95, width: 2 },
      { min: 100, max: 1000, width: 50 },
      { min: 0, max: 18, width: 1 },
    ];
    for (const { min, max, width } of cases) {
      const expectedRange = { min, max };
      expect(dailyWeighingDistribution(sample, { expectedRange }).bin_width).toBe(width);
      const withDistantAnomaly = dailyWeighingDistribution([
        ...sample, individual('far', '1000000', true),
      ], { expectedRange });
      expect(withDistantAnomaly.bin_width).toBe(width);
      expect(withDistantAnomaly.bins.length).toBeLessThanOrEqual(4);
      expect(withDistantAnomaly.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
      expect(withDistantAnomaly.bins.every((bin) => Number.isFinite(bin.center)
        && bin.upper > bin.lower && bin.upper - bin.lower <= width)).toBe(true);
    }
  });

  it('centers the density on the full-sample mean, keeping anomalies and expected limits', () => {
    const selectedWeighing: DailyWeighing = {
      ...weighing,
      expected_range: { ...weighing.expected_range!, min_weight_g: '10', max_weight_g: '100' },
    };
    const entries = [
      individual('normal-low', '20'), individual('normal-high', '80'),
      individual('near-low', '105', true), individual('near-edge', '145', true),
      individual('distant', '276', true),
    ];
    const fixture = render(entries, selectedWeighing);
    const histogram = fixture.componentInstance.histogram();
    const fullSample = dailyWeighingDistribution(entries, { expectedRange: { min: 10, max: 100 } });
    expect(histogram?.binWidth).toBe(5);
    expect((histogram!.lower + histogram!.upper) / 2).toBeCloseTo(fullSample.mean!);
    expect(histogram!.lower).toBeLessThan(10);
    expect(histogram!.upper).toBeGreaterThan(100);
    expect(histogram?.bars.reduce((sum, bin) => sum + bin.count, 0)).toBe(5);
    expect(histogram?.bars.reduce((sum, bin) => sum + bin.anomalous, 0)).toBe(3);
    expect(histogram?.curve).toHaveLength(121);
    expect(histogram?.curve.every(([x, y]) => x >= histogram!.lower && x <= histogram!.upper && Number.isFinite(y))).toBe(true);
    const [curveX, curveY] = histogram!.curve[60];
    const deviation = fullSample.sample_stddev!;
    expect(curveX).toBeCloseTo(fullSample.mean!);
    expect(curveY).toBeCloseTo(1 / (deviation * Math.sqrt(2 * Math.PI)), 10);
    expect(histogram!.curve.every((point) => point[1] <= curveY)).toBe(true);
    const barArea = histogram!.bars.reduce((area, bar) => area + bar.count * histogram!.densityScale * 5, 0);
    expect(barArea).toBeCloseTo(1, 12);
    expect(fixture.componentInstance.distribution().mean).toBe(fullSample.mean);
    expect(fixture.componentInstance.distribution().sample_stddev).toBe(fullSample.sample_stddev);
    expect(fullSample.bins.reduce((sum, bin) => sum + bin.anomalous, 0)).toBe(3);
    expect(fixture.nativeElement.querySelector('.distribution-metrics')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('medición individual alejada');
    expect(fixture.nativeElement.querySelector('.chart-wrap')?.getAttribute('aria-label')).not.toContain('no dibujada');
  });

  it('plots every valid weight when no expected range is available', () => {
    const fixture = render([...sample, individual('distant', '1000000', true)], {
      ...weighing, expected_range: null,
    });
    expect(fixture.componentInstance.histogram()?.bars.reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
  });

  it('includes both edges of the uniformity band using original weights', () => {
    const distribution = dailyWeighingDistribution([
      individual('low', '90'), individual('middle', '100'), individual('high', '110'),
    ], { binWidth: 50 });
    expect(distribution.uniformity_lower).toBeCloseTo(90);
    expect(distribution.uniformity_upper).toBeCloseTo(110);
    expect(distribution.uniformity_percent).toBe(100);
  });

  it('keeps one observation visible without inventing a sample deviation or normal curve', () => {
    const fixture = render([individual('only', '80'), group('g1', 100, '10000')]);
    const distribution = fixture.componentInstance.distribution();
    expect(distribution).toMatchObject({ n: 1, mean: 80, sample_stddev: null, minimum: 80, maximum: 80, curve: null });
    expect(fixture.nativeElement.textContent).toContain('Hay una sola medición individual');
    expect(fixture.nativeElement.textContent).toContain('No disponible');
    expect(fixture.componentInstance.histogram()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No hay registros suficientes como para armar la campana');
    expect(fixture.nativeElement.querySelector('.chart-wrap')?.hasAttribute('hidden')).toBe(true);
  });

  it('shows equal observations as one bar with zero deviation and no infinite density', () => {
    const fixture = render([individual('a', '80'), individual('b', '80'), individual('c', '80')]);
    const distribution = fixture.componentInstance.distribution();
    expect(distribution).toMatchObject({ n: 3, mean: 80, sample_stddev: 0, uniformity_percent: 100, curve: null });
    expect(distribution.bins).toHaveLength(1);
    expect(distribution.bins[0].count).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Todos los pesos individuales son iguales');
    expect(fixture.componentInstance.histogram()?.curve).toEqual([]);
    const decimalWeights = dailyWeighingDistribution([
      individual('d1', '0.1'), individual('d2', '0.1'), individual('d3', '0.1'),
    ]);
    expect(decimalWeights.sample_stddev).toBe(0);
    expect(decimalWeights.curve).toBeNull();
  });

  it('reports invalid individual records excluded from the sample', () => {
    const invalid = [individual('missing', null), individual('zero', '0'), individual('nan', 'NaN'),
      { ...individual('bad-count', '82'), bird_count: 2 }];
    const fixture = render([...sample, ...invalid, group('g1', 50, '5000')]);
    expect(fixture.componentInstance.distribution().n).toBe(3);
    expect(fixture.componentInstance.distribution().excluded_individual_count).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('4 registros individuales excluidos');
  });

  it('normalizes probability density over the complete normal domain and handles zero variance', () => {
    for (const [mean, deviation] of [[750, 50], [40, 80], [1800, 300]]) {
      const steps = 4000;
      const width = 16 * deviation / steps;
      let area = 0;
      for (let index = 0; index < steps; index++) {
        area += normalWeightDensity(mean - 8 * deviation + (index + .5) * width, mean, deviation) * width;
      }
      expect(area).toBeCloseTo(1, 10);
      expect(normalWeightDensity(mean, mean, deviation)).toBeCloseTo(1 / (deviation * Math.sqrt(2 * Math.PI)), 10);
    }
    expect(normalWeightDensity(80, 80, 0)).toBe(0);
  });

  it('uses the stage-specific snapshot returned by the API independently of the sample mean', () => {
    for (const stage of ['chick', 'adult'] as const) {
      const expected = stage === 'chick' ? { min: 10, max: 100 } : { min: 800, max: 1200 };
      const fixture = render([individual('a', '700', true), individual('b', '800')], {
        ...weighing, expected_range: { stage, min_weight_g: String(expected.min), max_weight_g: String(expected.max), unit: 'g', reference_version: 7 },
      });
      const histogram = fixture.componentInstance.histogram()!;
      expect(histogram.expectedRange).toEqual(expected);
      expect((histogram.lower + histogram.upper) / 2).toBeCloseTo(750);
      expect(histogram.lower).toBeLessThan(expected.min);
      expect(histogram.upper).toBeGreaterThan(expected.max);
      const options = fixture.componentInstance['options'](histogram, 390);
      expect(options.xAxis).toMatchObject({ min: histogram.lower, max: histogram.upper });
      expect(options.yAxis).toMatchObject({ name: 'Densidad (1/g)', max: histogram.yMax });
      const series = Array.isArray(options.series) ? options.series : [];
      expect(series[0].markLine?.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ xAxis: 750, label: expect.objectContaining({ show: true, formatter: 'Media 750 g' }) }),
        expect.objectContaining({ xAxis: expected.min }),
        expect.objectContaining({ xAxis: expected.max }),
      ]));
    }
  });

  it('keeps inclusive expected limits unflagged and admits confirmed anomalies into all metrics', () => {
    const data = [individual('lower', '65'), individual('upper', '95'), individual('outside', '120', true)];
    const result = dailyWeighingDistribution(data);
    expect(result.mean).toBeCloseTo(280 / 3);
    expect(result.bins.reduce((total, bin) => total + bin.anomalous, 0)).toBe(1);
    expect(result.n).toBe(3);
    expect(result.curve).not.toBeNull();
  });

  it('ends an interval at the inclusive upper limit without crossing it', () => {
    const entries = [individual('a', '3800'), individual('limit', '4000')];
    const fixture = render(entries, { ...weighing,
      expected_range: { stage: 'adult', min_weight_g: '100', max_weight_g: '4000', unit: 'g', reference_version: 1 },
    });
    const histogram = fixture.componentInstance.histogram()!;
    expect(histogram.binWidth).toBe(200);
    expect(histogram.bars.find((bar) => bar.center === 3950)).toEqual({
      lower: 3900, upper: 4000, center: 3950, count: 1, anomalous: 0,
    });
    const options = fixture.componentInstance['options'](histogram, 740);
    const series = Array.isArray(options.series) ? options.series : [];
    expect(series[0].data).toContainEqual([3950, 1 / (2 * 100), 3900, 4000, 0]);
    expect(series[0].markLine?.data).toContainEqual(expect.objectContaining({ xAxis: 4000 }));
    expect(fixture.componentInstance.distribution()).toMatchObject({ n: 2, mean: 3900, sample_stddev: Math.sqrt(20000) });
  });

  it('separates adjacent anomalies from inclusive limits and normalizes shortened intervals', () => {
    const entries = [individual('low-out', '999', true), individual('low', '1000'),
      individual('high', '4000'), individual('high-out', '4001', true)];
    const fixture = render(entries, { ...weighing,
      expected_range: { ...weighing.expected_range!, min_weight_g: '1000', max_weight_g: '4000' },
    });
    const histogram = fixture.componentInstance.histogram()!;
    expect(histogram.bars).toEqual([
      { lower: 900, upper: 1000, center: 950, count: 1, anomalous: 1 },
      { lower: 1000, upper: 1100, center: 1050, count: 1, anomalous: 0 },
      { lower: 3900, upper: 4000, center: 3950, count: 1, anomalous: 0 },
      { lower: 4000, upper: 4100, center: 4050, count: 1, anomalous: 1 },
    ]);
    const options = fixture.componentInstance['options'](histogram, 390);
    const series = Array.isArray(options.series) ? options.series : [];
    expect(series[0].data).toContainEqual([3950, .0025, 3900, 4000, 0]);
    expect(series[1].data).toContainEqual([4050, .0025, 4000, 4100, 0]);
    expect(histogram.bars.reduce((area, bar) => area + bar.count / entries.length, 0)).toBe(1);
    expect(fixture.componentInstance.distribution()).toMatchObject({ n: 4, mean: 2500 });
    const edge = dailyWeighingDistribution([individual('upper-edge', '1100'), individual('outside', '1100.1', true)],
      { binWidth: 200, expectedRange: { min: 1000, max: 1100 } });
    expect(edge.bins).toEqual([
      { lower: 1000, upper: 1100, center: 1050, count: 1, anomalous: 0 },
      { lower: 1100, upper: 1300, center: 1200, count: 1, anomalous: 1 },
    ]);
  });

  it('assigns centered intervals without losing or duplicating observations at their edges', () => {
    const distribution = dailyWeighingDistribution([
      individual('below', '3949.9'), individual('lower', '3950'), individual('center', '4000'),
      individual('inside', '4049.9'), individual('upper', '4050', true),
    ], { binWidth: 100 });
    expect(distribution.bins.map(({ center, count }) => ({ center, count }))).toEqual([
      { center: 3900, count: 1 }, { center: 4000, count: 3 }, { center: 4100, count: 1 },
    ]);
    expect(distribution.bins.reduce((total, bin) => total + bin.count, 0)).toBe(5);
    expect(distribution.bins.reduce((total, bin) => total + bin.anomalous, 0)).toBe(1);
    const oddWidth = dailyWeighingDistribution([individual('round', '80')], { binWidth: 5 });
    expect(oddWidth.bins[0]).toMatchObject({ lower: 77.5, upper: 82.5, center: 80, count: 1 });
  });
});
