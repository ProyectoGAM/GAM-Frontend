import { afterRenderEffect, Component, computed, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import type { ComposeOption, EChartsType } from 'echarts/core';
import { CustomChart, LineChart } from 'echarts/charts';
import type { CustomSeriesOption, LineSeriesOption } from 'echarts/charts';
import { AriaComponent, GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { LabelLayout } from 'echarts/features';

import { ThemeService } from '../../../../core/theme/theme.service';
import { DailyWeighing } from '../../interfaces/flock-weighing.interface';
import { dailyWeighingGrowth, GrowthPoint } from './daily-weighing-growth';

echarts.use([CustomChart, LineChart, AriaComponent, GridComponent, MarkLineComponent, TooltipComponent, SVGRenderer, LabelLayout]);
type ChartOption = ComposeOption<CustomSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption>;
const DAY_MS = 86_400_000;
const grams = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 });
const dateLabel = new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeZone: 'UTC' });

@Component({
  selector: 'app-weighing-growth-chart',
  templateUrl: './weighing-growth-chart.component.html',
  styleUrl: './weighing-growth-chart.component.scss',
})
export class WeighingGrowthChartComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chartHost = viewChild<ElementRef<HTMLDivElement>>('chartHost');
  private readonly width = signal(740);
  private chart: EChartsType | null = null;
  private observer: ResizeObserver | null = null;
  readonly days = input<readonly DailyWeighing[]>([]);
  readonly points = computed(() => dailyWeighingGrowth(this.days()));
  readonly latest = computed(() => this.points().at(-1) ?? null);
  readonly hasRange = computed(() => this.points().some((point) => point.range));
  readonly formatWeight = (value: number): string => grams.format(value);
  readonly formatDate = (value: number): string => fullDate.format(value);
  readonly description = computed(() => `Evolución del peso promedio por ave en ${this.points().length} ${this.points().length === 1 ? 'fecha' : 'fechas'}. `
    + 'Cada punto representa el promedio diario ponderado de ingresos individuales y grupales. '
    + 'Los triángulos indican promedios fuera del rango esperado de su fecha.');

  constructor() {
    afterRenderEffect(() => {
      const host = this.chartHost()?.nativeElement;
      const points = this.points();
      const width = this.width();
      this.theme.isDarkMode();
      if (!host || !points.length) {
        this.observer?.disconnect();
        this.chart?.dispose();
        this.chart = null;
        return;
      }
      if (!host.getBoundingClientRect().width) return;
      if (!this.chart) {
        this.chart = echarts.init(host, undefined, { renderer: 'svg' });
        this.width.set(Math.round(host.getBoundingClientRect().width));
        if (typeof ResizeObserver !== 'undefined') {
          this.observer = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width > 0) this.width.set(Math.round(entry.contentRect.width));
          });
          this.observer.observe(host);
        }
      }
      this.chart.resize();
      this.chart.setOption(this.options(points, width), { notMerge: true });
    });
    this.destroyRef.onDestroy(() => { this.observer?.disconnect(); this.chart?.dispose(); });
  }

  private options(points: GrowthPoint[], width: number): ChartOption {
    const style = getComputedStyle(this.element.nativeElement);
    const color = (token: string): string => style.getPropertyValue(`--gam-color-${token}`).trim();
    const blue = color('focus');
    const red = color('danger');
    const muted = color('text-muted');
    const first = points[0];
    const last = points[points.length - 1];
    const xMin = first.timestamp - DAY_MS * .7;
    const xMax = last.timestamp + DAY_MS * .7;
    const commonRange = first.range && points.every((point) => point.range?.min === first.range?.min
      && point.range?.max === first.range?.max) ? first.range : null;
    const rangePoints = points.filter((point) => point.range !== null);
    const ranges = commonRange ? [first] : rangePoints;
    const renderRange: NonNullable<CustomSeriesOption['renderItem']> = (_params, api) => {
      const timestamp = Number(api.value(0));
      const min = Number(api.value(1));
      const max = Number(api.value(2));
      const left = api.coord([commonRange ? xMin : timestamp - DAY_MS / 2, max]);
      const right = api.coord([commonRange ? xMax : timestamp + DAY_MS / 2, min]);
      return { type: 'group', children: [
        { type: 'rect', shape: { x: left[0], y: left[1], width: right[0] - left[0], height: right[1] - left[1] },
          style: { fill: color('primary-soft'), opacity: .55 } },
        ...[left[1], right[1]].map((y) => ({ type: 'line' as const,
          shape: { x1: left[0], y1: y, x2: right[0], y2: y },
          style: { stroke: blue, lineDash: [5, 4], lineWidth: 1.2 } })),
      ] };
    };
    return {
      animation: false, useUTC: true,
      aria: { enabled: true, description: this.description() },
      grid: { left: width < 500 ? 63 : 82, right: 20, top: 35, bottom: 57 },
      tooltip: {
        trigger: 'item', confine: true, renderMode: 'richText',
        backgroundColor: color('surface'), borderColor: color('control-border'), textStyle: { color: color('text') },
        formatter: (params: unknown) => {
          const item = params as { dataIndex?: number; seriesName?: string };
          const point = points[item.dataIndex ?? -1];
          if (!point || item.seriesName !== 'Promedio diario') return '';
          return `${fullDate.format(point.timestamp)}${point.inProgress ? ' · En curso' : ''}\n`
            + `Promedio: ${grams.format(point.average)} g/ave\nAves pesadas: ${grams.format(point.birds)}\n`
            + (point.range ? `Rango esperado: ${grams.format(point.range.min)}–${grams.format(point.range.max)} g`
              : 'Rango esperado: dato no disponible') + (point.outside ? '\n⚠ Fuera del rango esperado' : '');
        },
      },
      xAxis: {
        type: 'time', min: xMin, max: xMax, minInterval: DAY_MS, splitNumber: width < 500 ? 3 : 7,
        name: 'Fecha', nameLocation: 'middle', nameGap: 34, nameTextStyle: { color: color('heading'), fontWeight: 600 },
        axisLabel: { color: muted, hideOverlap: true, showMinLabel: false, showMaxLabel: false,
          formatter: (value: number) => dateLabel.format(value) },
        axisLine: { lineStyle: { color: muted } }, splitLine: { show: false },
      },
      yAxis: {
        type: 'value', min: 0, boundaryGap: [0, '18%'],
        splitNumber: 4, name: 'Peso promedio (g/ave)', nameLocation: 'middle', nameGap: width < 500 ? 43 : 59,
        nameTextStyle: { color: color('heading'), fontWeight: 600 },
        axisLabel: { color: muted, formatter: (value: number) => width < 500 && value >= 1000
          ? `${grams.format(value / 1000)}k` : grams.format(value) },
        splitLine: { lineStyle: { color: color('border') } },
      },
      series: [
        { type: 'custom', name: 'Rango esperado', silent: true, renderItem: renderRange, clip: true, z: 1, encode: { x: 0, y: [1, 2] },
          data: ranges.map((point) => [point.timestamp, point.range!.min, point.range!.max]) },
        { type: 'line', name: 'Promedio diario', smooth: false, z: 3, showAllSymbol: true,
          labelLayout: { hideOverlap: true },
          lineStyle: { color: blue, width: 2.5 }, symbolSize: 10,
          data: points.map((point) => ({ value: [point.timestamp, point.average],
            symbol: point.outside ? 'triangle' : 'circle', symbolSize: point.outside ? 13 : 10,
            itemStyle: { color: point.outside ? red : blue },
            label: { show: width >= 500 && points.length <= 12, position: 'top',
              formatter: grams.format(point.average), color: point.outside ? red : blue, fontWeight: 600 } })),
          markLine: commonRange ? { silent: true, symbol: 'none', lineStyle: { color: blue, type: 'dashed', width: 1.2 },
            label: { show: true, position: 'insideEndTop', color: blue }, data: [
              { yAxis: commonRange.min, label: { formatter: `Mínimo ${grams.format(commonRange.min)} g` } },
              { yAxis: commonRange.max, label: { formatter: `Máximo ${grams.format(commonRange.max)} g` } },
            ] } : undefined,
        },
      ],
    };
  }
}
