import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, output, signal, viewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import type { ComposeOption, EChartsType } from 'echarts/core';
import { LineChart, LineSeriesOption } from 'echarts/charts';
import { AriaComponent, GridComponent, GridComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { ThemeService } from '../../../../core/theme/theme.service';
import { CollectionPoint } from '../../interfaces/flock-collection.interface';
import { collectionNumber } from '../../services/collection-summary';

echarts.use([LineChart, AriaComponent, GridComponent, SVGRenderer]);
type ChartOption = ComposeOption<LineSeriesOption | GridComponentOption>;

@Component({
  selector: 'app-collection-chart',
  template: '<div #host class="chart" role="img" [attr.aria-label]="description()"></div>',
  styles: [':host { display: block; min-width: 0; } .chart { width: 100%; height: 290px; }'],
})
export class CollectionChartComponent {
  readonly points = input.required<readonly CollectionPoint[]>();
  readonly average = input<number | null>(null);
  readonly selected = input<string | null>(null);
  readonly firstHistoricalDate = input<string | null>(null);
  readonly seriesLabel = input('Recolección diaria');
  readonly pointSelected = output<string>();
  readonly description = computed(() => `Huevos por día en función de la fecha. ${this.seriesLabel()}. Puntos unidos por líneas rectas; los intervalos sin registros aparecen como huecos. ${this.average() === null ? '' : `Promedio del período: ${collectionNumber(this.average()!)} huevos por día.`} Los valores se pueden consultar en el selector de intervalo y los registros históricos.`);
  private readonly theme = inject(ThemeService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = viewChild<ElementRef<HTMLDivElement>>('host');
  private readonly width = signal(360);
  private chart: EChartsType | null = null;
  private observer: ResizeObserver | null = null;

  constructor() {
    afterRenderEffect(() => {
      this.theme.isDarkMode();
      const host = this.host()?.nativeElement;
      const points = this.points();
      const average = this.average();
      const selected = this.selected();
      const firstHistoricalDate = this.firstHistoricalDate();
      const seriesLabel = this.seriesLabel();
      const width = this.width();
      if (!host || !points.some((point) => point.quantity !== null)) return;
      if (!this.chart) {
        this.chart = echarts.init(host, undefined, { renderer: 'svg' });
        this.chart.on('click', (event) => {
          if ('seriesIndex' in event && event.seriesIndex === 0 && 'dataIndex' in event && typeof event.dataIndex === 'number') {
            const point = this.points()[event.dataIndex];
            if (point) this.pointSelected.emit(point.date);
          }
        });
        if (typeof ResizeObserver !== 'undefined') {
          this.observer = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width > 0) this.width.set(Math.round(entry.contentRect.width));
          });
          this.observer.observe(host);
        }
      }
      const style = getComputedStyle(this.element.nativeElement);
      const color = (name: string) => style.getPropertyValue(`--gam-color-${name}`).trim();
      const timestamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
      const includesYear = points[0].date.slice(0, 4) !== points.at(-1)!.date.slice(0, 4);
      const dateLabel = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', timeZone: 'UTC',
        ...(includesYear ? { year: '2-digit' as const } : {}) });
      const series: LineSeriesOption[] = [{ name: seriesLabel, type: 'line', smooth: false, connectNulls: false,
        symbol: 'circle', showAllSymbol: true, lineStyle: { color: color('primary'), width: 2.5 },
        data: points.map((point) => ({ value: [timestamp(point.date), point.quantity], symbolSize: point.date === selected ? 12 : 8,
          itemStyle: { color: color(point.date === firstHistoricalDate ? 'chart-first-point' : 'surface'),
            borderColor: color(point.date === firstHistoricalDate ? 'chart-first-point' : 'primary'), borderWidth: 2 } })) }];
      if (average !== null) series.push({ name: 'Promedio del período', type: 'line', smooth: false, symbol: 'none', silent: true,
        lineStyle: { color: color('primary'), width: 1.5, type: 'dashed' },
        data: [[timestamp(points[0].date), average], [timestamp(points.at(-1)!.date), average]] });
      const option: ChartOption = {
        animation: false, useUTC: true, aria: { enabled: true, description: this.description() },
        grid: { left: 48, right: 20, top: 28, bottom: 62 },
        xAxis: { type: 'time', min: timestamp(points[0].date), max: timestamp(points.at(-1)!.date),
          splitNumber: width < 500 ? 3 : 6, name: 'Fecha', nameLocation: 'middle', nameGap: 42,
          nameTextStyle: { color: color('text-muted') }, axisLabel: { color: color('text-muted'), hideOverlap: true,
            fontSize: width < 500 ? 10 : 12, formatter: (value: number) => dateLabel.format(new Date(value)) },
          axisTick: { show: false }, axisLine: { lineStyle: { color: color('text-muted') } } },
        yAxis: { type: 'value', min: 0, minInterval: 1, name: 'Huevos/día',
          nameTextStyle: { color: color('text-muted') }, axisLabel: { color: color('text-muted'), formatter: (value: number) => collectionNumber(value) },
          splitLine: { lineStyle: { color: color('border') } } }, series,
      };
      this.chart.resize();
      this.chart.setOption(option, { notMerge: true });
    });
    this.destroyRef.onDestroy(() => { this.observer?.disconnect(); this.chart?.dispose(); });
  }
}
