import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, viewChild } from '@angular/core';
import { BarChart, BarSeriesOption } from 'echarts/charts';
import { GridComponent, GridComponentOption, TooltipComponent, TooltipComponentOption } from 'echarts/components';
import { init, use, type ComposeOption, type EChartsType } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { ThemeService } from '../../../core/theme/theme.service';
import { EggMetrics, SummaryPeriod } from '../interfaces/operational-summary';
import { productionDays, summaryNumber } from '../services/summary-presentation';

use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);
const weekday = new Intl.DateTimeFormat('es-UY', { weekday: 'short', timeZone: 'UTC' });

@Component({
  selector: 'app-summary-production-chart',
  template: `
    <div #plot class="chart" role="img" aria-label="Huevos recolectados por día"></div>
    <dl class="chart-data" aria-label="Datos diarios de recolección">
      @for (day of days(); track day.date) {
        <div><dt>{{ day.label }}</dt><dd>{{ day.quantity === null ? 'Sin registros' : number(day.quantity) }}</dd></div>
      }
    </dl>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .chart { width: 100%; height: clamp(10.5rem, 22cqi, 12.1rem); }
    .chart-data {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip-path: inset(50%); white-space: nowrap;
    }
  `],
})
export class SummaryProductionChartComponent {
  readonly period = input.required<SummaryPeriod>();
  readonly metrics = input.required<EggMetrics>();
  protected readonly days = computed(() => productionDays(this.period(), this.metrics().by_day));
  protected readonly number = summaryNumber;
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly plot = viewChild.required<ElementRef<HTMLDivElement>>('plot');
  private chart?: EChartsType;
  private resize?: ResizeObserver;

  constructor() {
    afterRenderEffect(() => {
      this.theme.isDarkMode();
      const element = this.plot().nativeElement;
      const days = this.days();
      const latest = this.metrics().by_day.at(-1)?.date;
      const style = getComputedStyle(element);
      const color = (name: string) => style.getPropertyValue('--gam-color-' + name).trim();
      if (!this.chart) {
        this.chart = init(element, undefined, { renderer: 'svg' });
        if (typeof ResizeObserver !== 'undefined') {
          this.resize = new ResizeObserver(() => this.chart?.resize());
          this.resize.observe(element);
        }
      }
      const option: ComposeOption<BarSeriesOption | GridComponentOption | TooltipComponentOption> = {
        animation: false,
        grid: { left: 53, top: 13, right: 8, bottom: 26 },
        tooltip: { trigger: 'axis', renderMode: 'richText', confine: true,
          backgroundColor: color('surface'), borderColor: color('border'), textStyle: { color: color('text') } },
        xAxis: { type: 'category', data: days.map((day) => days.length <= 7 ? weekLabel(day.date) : day.label),
          axisLabel: { color: color('text-muted'), hideOverlap: true },
          axisLine: { lineStyle: { color: color('border') } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: 1, splitNumber: 4,
          axisLabel: { color: color('text-muted'), formatter: (value: number) => value >= 1000 ? summaryNumber(value / 1000) + ' mil' : summaryNumber(value) },
          splitLine: { lineStyle: { color: color('border') } } },
        series: [{ name: 'Huevos recolectados', type: 'bar', barMaxWidth: 53, itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: days.map((day) => ({
            value: day.quantity ?? '-', itemStyle: { color: color(day.date === latest ? 'primary' : 'chart-bar') },
          })) }],
      };
      this.chart.setOption(option, { notMerge: true });
    });
    this.destroyRef.onDestroy(() => { this.resize?.disconnect(); this.chart?.dispose(); });
  }
}

function weekLabel(date: string): string {
  const label = weekday.format(new Date(date + 'T00:00:00Z')).replace(/\.$/, '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}
