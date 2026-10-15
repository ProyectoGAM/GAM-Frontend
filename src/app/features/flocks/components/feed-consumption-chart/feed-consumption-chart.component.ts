import { afterRenderEffect, Component, computed, DestroyRef, ElementRef, inject, input, viewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import type { ComposeOption, EChartsType } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import type { BarSeriesOption } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import { ThemeService } from '../../../../core/theme/theme.service';
import { DailyFeedPoint } from '../../interfaces/flock-feeding.interface';
import { feedingDate } from '../../services/feeding-summary';

echarts.use([BarChart, AriaComponent, GridComponent, TooltipComponent, SVGRenderer]);
type ChartOption = ComposeOption<BarSeriesOption | GridComponentOption | TooltipComponentOption>;

@Component({
  selector: 'app-feed-consumption-chart',
  templateUrl: './feed-consumption-chart.component.html',
  styleUrl: './feed-consumption-chart.component.scss',
})
export class FeedConsumptionChartComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = viewChild<ElementRef<HTMLDivElement>>('chartHost');
  private chart: EChartsType | null = null;
  private observer: ResizeObserver | null = null;
  readonly points = input.required<readonly DailyFeedPoint[]>();
  readonly recipeName = input.required<string>();
  readonly description = computed(() => `Consumo diario de ${this.recipeName()} en kilogramos. ${this.points().length} fechas registradas. Los días sin cierre no representan consumo cero.`);
  readonly accessibleRows = computed(() => this.points().map((point) => ({ ...point, dateText: feedingDate(point.date) })));

  constructor() {
    afterRenderEffect(() => {
      const host = this.host()?.nativeElement;
      const points = this.points();
      this.theme.isDarkMode();
      if (!host || !points.length) { this.dispose(); return; }
      if (!host.getBoundingClientRect().width) return;
      if (!this.chart) {
        this.chart = echarts.init(host, undefined, { renderer: 'svg' });
        if (typeof ResizeObserver !== 'undefined') {
          this.observer = new ResizeObserver(() => this.chart?.resize());
          this.observer.observe(host);
        }
      }
      const style = getComputedStyle(this.element.nativeElement);
      const color = (name: string) => style.getPropertyValue(`--gam-color-${name}`).trim();
      const option: ChartOption = {
        animation: false,
        aria: { enabled: true, description: this.description() },
        grid: { left: 60, right: 12, top: 30, bottom: 48 },
        tooltip: {
          trigger: 'item', confine: true, renderMode: 'richText',
          backgroundColor: color('surface'), borderColor: color('control-border'), textStyle: { color: color('text') },
          formatter: (params: unknown) => {
            const point = points[(params as { dataIndex?: number }).dataIndex ?? -1];
            return point ? `${feedingDate(point.date)}\n${this.recipeName()}: ${point.quantityText} kg` : '';
          },
        },
        xAxis: {
          type: 'time', minInterval: 86400000,
          min: Date.parse(`${points[0].date}T00:00:00Z`) - 43200000,
          max: Date.parse(`${points[points.length - 1].date}T00:00:00Z`) + 43200000,
          splitNumber: 4,
          axisLabel: { color: color('text-muted'), hideOverlap: true,
            formatter: (value: number) => new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(value) },
          axisLine: { lineStyle: { color: color('text-muted') } }, splitLine: { show: false },
        },
        yAxis: { type: 'value', min: 0, name: 'kg', splitNumber: 4,
          nameTextStyle: { color: color('text-muted') }, axisLabel: { color: color('text-muted') },
          splitLine: { lineStyle: { color: color('border') } } },
        // Exactly one selected recipe. Conversion to Number is only for drawing; all totals/text remain exact.
        series: [{ type: 'bar', name: this.recipeName(), barMaxWidth: 42,
          itemStyle: { color: color('primary') },
          data: points.map((point) => [Date.parse(`${point.date}T00:00:00Z`), Number(point.grams) / 1000]) }],
        useUTC: true,
      };
      this.chart.resize();
      this.chart.setOption(option, { notMerge: true });
    });
    this.destroyRef.onDestroy(() => this.dispose());
  }

  private dispose(): void {
    this.observer?.disconnect(); this.observer = null;
    this.chart?.dispose(); this.chart = null;
  }
}
