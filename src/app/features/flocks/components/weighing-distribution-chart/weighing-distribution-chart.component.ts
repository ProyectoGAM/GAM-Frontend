import { afterRenderEffect, Component, computed, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import type { ComposeOption, EChartsType } from 'echarts/core';
import { CustomChart, LineChart } from 'echarts/charts';
import type { CustomSeriesOption, LineSeriesOption } from 'echarts/charts';
import { AriaComponent, GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import { ThemeService } from '../../../../core/theme/theme.service';
import { DailyWeighing, DailyWeighingEntry } from '../../interfaces/flock-weighing.interface';
import { dailyWeighingDistribution, normalWeightDensity } from './daily-weighing-distribution';

echarts.use([CustomChart, LineChart, AriaComponent, GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);

type ChartOption = ComposeOption<CustomSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption>;
interface Histogram {
  mean: number;
  binWidth: number;
  lower: number;
  upper: number;
  yMax: number;
  densityScale: number;
  bars: Array<{ lower: number; upper: number; center: number; count: number; anomalous: number }>;
  curve: Array<[number, number]>;
  uniformity: { lower: number; upper: number } | null;
  expectedRange: { min: number; max: number } | null;
}
const format = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 });
const formatDensity = new Intl.NumberFormat('es-UY', { maximumSignificantDigits: 3 });

@Component({
  selector: 'app-weighing-distribution-chart',
  templateUrl: './weighing-distribution-chart.component.html',
  styleUrl: './weighing-distribution-chart.component.scss',
})
export class WeighingDistributionChartComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  private readonly chartHost = viewChild<ElementRef<HTMLDivElement>>('chartHost');
  private readonly chartWidth = signal(740);
  private chart: EChartsType | null = null;
  private observer: ResizeObserver | null = null;

  readonly weighing = input<DailyWeighing | null>(null);
  readonly entries = input<DailyWeighingEntry[]>([]);
  readonly expectedRange = computed(() => {
    const expected = this.weighing()?.expected_range;
    const min = Number(expected?.min_weight_g);
    const max = Number(expected?.max_weight_g);
    return expected && Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max > min
      ? { min, max } : null;
  });
  readonly distribution = computed(() => dailyWeighingDistribution(this.entries(), {
    expectedRange: this.expectedRange() ?? undefined,
  }));
  readonly formatGrams = (value: string | number): string => format.format(Number(value));
  readonly cv = computed(() => {
    const distribution = this.distribution();
    return distribution.n > 1 && distribution.mean !== null && distribution.sample_stddev !== null
      ? `${format.format((distribution.sample_stddev / distribution.mean) * 100)} %` : 'No disponible';
  });

  readonly histogram = computed<Histogram | null>(() => {
    const distribution = this.distribution();
    if (!distribution.available || distribution.n < 2 || distribution.mean === null || distribution.minimum === null
      || distribution.maximum === null || distribution.bin_width === null) return null;
    const mean = distribution.mean;
    const deviation = distribution.sample_stddev ?? 0;
    const binWidth = distribution.bin_width;
    const expectedRange = this.expectedRange();
    // A symmetric domain puts the real mean at the center without moving either reference limit.
    // A normal model may extend below zero; this does not fabricate observed negative weights.
    const radius = Math.max(
      4 * deviation, Math.abs(distribution.minimum - mean), Math.abs(distribution.maximum - mean),
      ...distribution.bins.map((bin) => Math.max(Math.abs(bin.lower - mean), Math.abs(bin.upper - mean))),
      expectedRange ? Math.abs(expectedRange.min - mean) : 0,
      expectedRange ? Math.abs(expectedRange.max - mean) : 0,
      mean * .1, binWidth,
    ) * 1.06;
    const lower = mean - radius;
    const upper = mean + radius;
    const densityScale = 1 / (distribution.n * binWidth);
    const visibleBins = distribution.bins.filter((bin) => bin.center >= lower && bin.center < upper);
    const bars = visibleBins.map((bin) => ({
      lower: bin.lower, upper: bin.upper, center: bin.center, count: bin.count, anomalous: bin.anomalous,
    }));
    // Sample the full-sample normal model within the visible window, even when its tails extend beyond it.
    const curve = distribution.curve && deviation > 0 ? Array.from({ length: 121 }, (_, index): [number, number] => {
      const x = lower + ((upper - lower) * index) / 120;
      return [x, normalWeightDensity(x, mean, deviation)];
    }) : [];
    const peak = Math.max(0, ...curve.map((point) => point[1]));
    const yMax = Math.max(...bars.map((bar) => bar.count / (distribution.n * (bar.upper - bar.lower))), peak) * 1.2;
    const uniformity = distribution.n > 1 && distribution.uniformity_lower !== null && distribution.uniformity_upper !== null
      ? { lower: distribution.uniformity_lower, upper: distribution.uniformity_upper } : null;
    return {
      mean, binWidth, lower, upper, yMax, densityScale, bars, curve, uniformity, expectedRange,
    };
  });

  constructor() {
    afterRenderEffect(() => {
      const host = this.chartHost()?.nativeElement;
      const histogram = this.histogram();
      const width = this.chartWidth();
      this.theme.isDarkMode();
      if (!host || !histogram || !host.getBoundingClientRect().width) return;
      if (!this.chart) this.initialize(host);
      this.chart?.resize();
      this.chart?.setOption(this.options(histogram, width), { notMerge: true });
    });
    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      this.chart?.dispose();
    });
  }

  private initialize(host: HTMLDivElement): void {
    this.chart = echarts.init(host, undefined, { renderer: 'svg' });
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(([entry]) => {
        const width = Math.round(entry.contentRect.width);
        if (width > 0) this.chartWidth.set(width);
      });
      this.observer.observe(host);
    }
    const width = Math.round(host.getBoundingClientRect().width);
    if (width > 0) this.chartWidth.set(width);
  }

  private options(data: Histogram, width: number): ChartOption {
    const style = getComputedStyle(this.element.nativeElement);
    const color = (token: string): string => style.getPropertyValue(token).trim();
    const blue = color('--gam-color-focus');
    const red = color('--gam-color-danger');
    const navy = color('--gam-color-heading');
    const muted = color('--gam-color-text-muted');
    const border = color('--gam-color-border');
    const lower = data.lower;
    const upper = data.upper;
    const sampleSize = this.distribution().n;
    const renderBar: NonNullable<CustomSeriesOption['renderItem']> = (_params, api) => {
      const left = api.coord([api.value(2), 0])[0];
      const right = api.coord([api.value(3), 0])[0];
      const base = Number(api.value(4));
      const bottom = api.coord([api.value(0), base])[1];
      const top = api.coord([api.value(0), base + Number(api.value(1))])[1];
      // Use each interval's actual bounds, including shortened boundary bins.
      // Never enforce a minimum pixel width that would cross an expected limit.
      const barWidth = (right - left) * .82;
      return { type: 'rect', shape: { x: left + (right - left - barWidth) / 2, y: top,
        width: barWidth, height: Math.max(0, bottom - top) }, style: api.style() };
    };
    const limitLines = data.expectedRange ? [
      { xAxis: data.expectedRange.min, lineStyle: { color: red, type: 'dashed' as const, width: 1.5 } },
      { xAxis: data.expectedRange.max, lineStyle: { color: red, type: 'dashed' as const, width: 1.5 } },
    ] : [];
    return {
      animation: false,
      aria: { enabled: true, description: `Histograma de densidad de ${this.distribution().n} aves de la muestra individual. Media ${format.format(data.mean)} gramos.${data.expectedRange ? ` Los límites esperados son ${format.format(data.expectedRange.min)} y ${format.format(data.expectedRange.max)} gramos.` : ''} Las barras muestran densidad observada en 1/g.${data.curve.length ? ' La línea continua es una densidad normal estimada.' : ''}` },
      grid: { left: width < 500 ? 70 : 82, right: width < 500 ? 16 : 25, top: 44, bottom: 58 },
      tooltip: {
        trigger: 'item', confine: true,
        formatter: (params: unknown) => {
          const item = params as { seriesName?: string; value?: number[] };
          const value = item.value ?? [];
          const bin = data.bars.find((candidate) => candidate.center === value[0]);
          const interval = bin ? `${format.format(bin.lower)}–${format.format(bin.upper)}` : format.format(value[0] ?? 0);
          const count = bin ? item.seriesName === 'Fuera del rango' ? bin.anomalous : bin.count - bin.anomalous : 0;
          return `${item.seriesName === 'Fuera del rango' ? 'Fuera del rango' : 'Aves observadas'}: ${format.format(count)}<br/>Intervalo: ${interval} g<br/>Densidad: ${formatDensity.format(value[1] ?? 0)} 1/g`;
        },
      },
      xAxis: {
        type: 'value', min: lower, max: upper, minInterval: 1, splitNumber: width < 500 ? 4 : 6,
        name: 'Peso individual (g)', nameLocation: 'middle', nameGap: 36,
        nameTextStyle: { color: navy, fontWeight: 600 },
        axisLabel: { color: muted, hideOverlap: true, showMinLabel: false, showMaxLabel: false, formatter: (value: number) => width < 500 && Math.abs(value) >= 1000
          ? `${format.format(value / 1000)}k` : format.format(value) },
        axisLine: { lineStyle: { color: muted } }, axisTick: { lineStyle: { color: muted } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value', min: 0, max: data.yMax, splitNumber: 4,
        name: 'Densidad (1/g)', nameLocation: 'middle', nameGap: 54,
        nameTextStyle: { color: navy, fontWeight: 600 },
        axisLabel: { color: muted, formatter: (value: number) => formatDensity.format(value) }, axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: border } },
      },
      series: [
        {
          name: 'Aves observadas', type: 'custom', renderItem: renderBar,
          encode: { x: 0, y: 1 }, itemStyle: { color: blue },
          data: data.bars.map((bar) => [bar.center, (bar.count - bar.anomalous) / (sampleSize * (bar.upper - bar.lower)), bar.lower, bar.upper, 0]),
          markArea: data.uniformity ? {
            silent: true, itemStyle: { color: color('--gam-color-primary-soft'), opacity: .48 },
            data: [[{ xAxis: data.uniformity.lower }, { xAxis: data.uniformity.upper }]],
          } : undefined,
          markLine: {
            silent: true, symbol: 'none', lineStyle: { color: blue, type: 'dashed', width: 1.5 },
            label: { show: false }, data: [{ xAxis: data.mean,
              label: { show: true, formatter: `Media ${format.format(data.mean)} g`, color: blue, position: 'end' },
            }, ...limitLines],
          },
        },
        {
          name: 'Fuera del rango', type: 'custom', renderItem: renderBar,
          encode: { x: 0, y: 1 }, itemStyle: { color: red },
          data: data.bars.map((bar) => [bar.center, bar.anomalous / (sampleSize * (bar.upper - bar.lower)),
            bar.lower, bar.upper, (bar.count - bar.anomalous) / (sampleSize * (bar.upper - bar.lower))]),
        },
        ...(data.curve.length ? [{
          name: 'Curva normal estimada', type: 'line', showSymbol: false, silent: true,
          lineStyle: { color: navy, width: 2.5 }, data: data.curve,
        } as LineSeriesOption] : []),
      ],
    };
  }
}
