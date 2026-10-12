import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, output, signal, viewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import type { ComposeOption, EChartsType } from 'echarts/core';
import { LineChart, LineSeriesOption } from 'echarts/charts';
import { AriaComponent, GridComponent, GridComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { ThemeService } from '../../../../core/theme/theme.service';
import { MortalityPoint } from '../../interfaces/flock-mortality.interface';

echarts.use([LineChart, AriaComponent, GridComponent, SVGRenderer]);
type ChartOption = ComposeOption<LineSeriesOption | GridComponentOption>;

@Component({
  selector: 'app-mortality-chart',
  template: '<div #host class="chart" role="img" [attr.aria-label]="description()"></div>',
  styles: [':host { display: block; min-width: 0; } .chart { height: 290px; width: 100%; }'],
})
export class MortalityChartComponent {
  readonly points = input.required<readonly MortalityPoint[]>();
  readonly selected = input<string | null>(null);
  readonly pointSelected = output<string>();
  readonly description = computed(() => 'Gallinas fallecidas por período. Puntos unidos por líneas rectas. '
    + this.points().map((point) => `${point.description}: ${point.quantity} gallinas`).join('. '));
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
      const width = this.width();
      const selected = this.selected();
      if (!host) return;
      if (!this.chart) {
        this.chart = echarts.init(host, undefined, { renderer: 'svg' });
        this.chart.on('click', (event) => {
          if ('dataIndex' in event && typeof event.dataIndex === 'number') {
            const point = this.points()[event.dataIndex];
            if (point) this.pointSelected.emit(point.key);
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
      const color = (name: string): string => style.getPropertyValue(`--gam-color-${name}`).trim();
      const primary = color('primary');
      const muted = color('text-muted');
      const options: ChartOption = {
        animation: false, aria: { enabled: true, description: this.description() },
        grid: { left: 55, right: 16, top: 26, bottom: 64 },
        xAxis: { type: 'category', data: points.map((point) => point.label), boundaryGap: true,
          name: 'Fecha', nameLocation: 'middle', nameGap: 44, nameTextStyle: { color: muted },
          axisLine: { lineStyle: { color: muted } }, axisTick: { show: false },
          axisLabel: { color: muted, interval: 0, rotate: width < 500 ? 35 : 0, fontSize: width < 500 ? 10 : 12 } },
        yAxis: { type: 'value', min: 0, minInterval: 1, max: Math.max(1, ...points.map((point) => point.quantity)),
          name: 'Gallinas fallecidas', nameLocation: 'middle', nameGap: 36, nameTextStyle: { color: muted },
          axisLabel: { color: muted }, splitLine: { lineStyle: { color: color('border') } } },
        series: [{ type: 'line', smooth: false, showAllSymbol: true, symbol: 'circle',
          lineStyle: { color: primary, width: 2.5 },
          label: { show: true, position: 'top', color: primary, fontWeight: 700 },
          data: points.map((point) => ({ value: point.quantity, symbolSize: point.key === selected ? 13 : 9,
            itemStyle: { color: point.key === selected ? primary : color('surface'), borderColor: primary, borderWidth: 2 } })) }],
      };
      this.chart.resize();
      this.chart.setOption(options, { notMerge: true });
    });
    this.destroyRef.onDestroy(() => { this.observer?.disconnect(); this.chart?.dispose(); });
  }
}
