import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, arrowDownOutline, arrowForwardOutline, arrowUpOutline, swapVerticalOutline } from 'ionicons/icons';
import { ReportResult, ReportSource } from '../interfaces/report';
import { formatReportCell } from '../services/report-query';
import { reportOptionLabel } from '../services/report-help';

@Component({
  selector: 'app-report-table',
  host: { '[class.standard-table]': 'compact()' },
  imports: [IonIcon],
  template: `
    <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="source().label">
      <table>
        <caption>{{ source().label }} · {{ result().pagination.total }} filas</caption>
        <thead><tr>@for (column of headers(); track column.key) {
          <th scope="col" [class.numeric]="compact() && column.numeric" [attr.aria-sort]="sortField() === column.key ? (sortDirection() === 'asc' ? 'ascending' : 'descending') : 'none'">
            @if (column.sortable) { <button type="button" (click)="sort.emit(column.key)">{{ column.label }} {{ column.unit }}<ion-icon [name]="sortField() === column.key ? (sortDirection() === 'asc' ? 'arrow-up-outline' : 'arrow-down-outline') : 'swap-vertical-outline'" aria-hidden="true" /></button> }
            @else { {{ column.label }} {{ column.unit }} }
          </th>
        }</tr></thead>
        <tbody>@for (row of rows(); track $index) { <tr>@for (value of row; track $index) { <td [class.numeric]="compact() && headers()[$index].numeric">{{ value }}</td> }</tr> }</tbody>
      </table>
    </div>
    @if (!result().rows.length) { <p role="status">No hay registros para esta consulta.</p> }
    <nav aria-label="Páginas del reporte">
      <button type="button" [disabled]="busy() || result().pagination.current_page <= 1" (click)="page.emit(result().pagination.current_page - 1)"><ion-icon name="arrow-back-outline" aria-hidden="true" />Anterior</button>
      <span>Página {{ result().pagination.current_page }} de {{ result().pagination.last_page }}@if (compact()) { · {{ result().pagination.total }} {{ result().pagination.total === 1 ? 'resultado' : 'resultados' }} }</span>
      <button type="button" [disabled]="busy() || result().pagination.current_page >= result().pagination.last_page" (click)="page.emit(result().pagination.current_page + 1)"><ion-icon name="arrow-forward-outline" aria-hidden="true" />Siguiente</button>
    </nav>
  `,
  styles: `
    .table-wrap { overflow-x: auto; border: 1px solid var(--gam-color-border); border-radius: .65rem; }
    table { width: 100%; border-collapse: collapse; color: var(--gam-color-text); }
    caption { text-align: left; padding: .85rem; color: var(--gam-color-text-muted); }
    th { background: var(--gam-color-surface-alt); color: var(--gam-color-heading); }
    th, td { text-align: left; padding: .85rem; border-bottom: 1px solid var(--gam-color-border); white-space: nowrap; }
    th button { background: transparent; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; min-height: 44px; }
    th button { display: inline-flex; align-items: center; gap: .5rem; } th ion-icon { font-size: 1rem; }
    nav { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; margin-top: 1rem; }
    nav button { min-height: 44px; padding: .5rem .85rem; border: 1px solid var(--gam-color-control-border); border-radius: .5rem; background: var(--gam-color-surface); color: var(--gam-color-text); }
    nav button { display: inline-flex; align-items: center; gap: .5rem; } nav ion-icon { font-size: 1rem; }
    :focus-visible { outline: 2px solid var(--gam-color-focus); outline-offset: 2px; }
    :host(.standard-table) .table-wrap { border: 0; border-radius: .5rem; }
    :host(.standard-table) caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    :host(.standard-table) th { background: var(--gam-color-primary-soft); }
    :host(.standard-table) th, :host(.standard-table) td { padding: .75rem 1rem; }
    :host(.standard-table) .numeric { text-align: right; font-variant-numeric: tabular-nums; }
    :host(.standard-table) th.numeric button { justify-content: end; }
    :host(.standard-table) nav { justify-content: space-between; color: var(--gam-color-text-muted); font-size: .85rem; }
    @media(max-width: 480px) { :host(.standard-table) nav span { order: -1; flex-basis: 100%; text-align: center; } }
  `,
})
export class ReportTableComponent {
  constructor() { addIcons({ 'arrow-back-outline': arrowBackOutline, 'arrow-forward-outline': arrowForwardOutline, 'arrow-up-outline': arrowUpOutline, 'arrow-down-outline': arrowDownOutline, 'swap-vertical-outline': swapVerticalOutline }); }
  readonly source = input.required<ReportSource>();
  readonly result = input.required<ReportResult>();
  readonly compact = input(false);
  readonly busy = input(false);
  readonly sortField = input('');
  readonly sortDirection = input<'asc' | 'desc'>('asc');
  readonly page = output<number>();
  readonly sort = output<string>();
  readonly headers = computed(() => this.result().columns.map((key) => {
    const metadata = this.source().columns[key] ?? this.source().groupings[key] ?? this.source().metrics[key];
    const unit = this.result().units[key];
    const label = this.compact() && this.source().key === 'lots.egg-production' && key === 'egg_count' ? 'Huevos recolectados' : metadata?.label ?? key;
    return { key, label, numeric: ['number', 'integer', 'quantity', 'money', 'count'].includes(metadata?.type ?? ''), unit: unit && unit !== 'base_unit' && !(this.compact() && (unit === 'currency' || unit.endsWith('_currency') || (this.source().key === 'lots.egg-production' && key === 'egg_count'))) ? '(' + unit + ')' : '', sortable: key in this.source().sorts };
  }));
  readonly rows = computed(() => this.result().rows.map((row) => this.result().columns.map((key) => {
    const field = this.source().columns[key] ?? this.source().groupings[key] ?? this.source().metrics[key];
    const value = row[key] ?? null;
    return reportOptionLabel(this.source().key, key, value ?? '', formatReportCell(value, field?.type ?? 'string'));
  })));
}
