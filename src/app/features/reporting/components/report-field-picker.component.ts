import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowDownOutline, arrowUpOutline } from 'ionicons/icons';
import { ReportField } from '../interfaces/report';
import { InfoHelpComponent } from '../../../shared/components/info-help.component';
import { reportFieldHelp } from '../services/report-help';

@Component({
  selector: 'app-report-field-picker',
  imports: [IonIcon, InfoHelpComponent],
  template: `
    <fieldset [attr.aria-label]="title()"><legend>{{ title() }}@if (helpText()) { <app-info-help [label]="title()" [text]="helpText()" /> }</legend><p>{{ hint() }}</p>
      <div class="choices">@for (field of fields(); track field.key) {
        <div class="field-choice"><label><input type="checkbox" [checked]="selected().includes(field.key)" (change)="toggle(field.key)" />
          <span>{{ field.label }}@if (field.unit && field.unit !== 'base_unit') { <small>{{ field.unit }}</small> }</span>
        </label>@if (fieldHelp()[field.key]; as help) { <app-info-help [label]="field.label" [text]="help" /> }</div>
      }</div>
    </fieldset>
    @if (ordered() && chosen().length) {
      <p class="order-hint">Así se ordenarán las columnas, de izquierda a derecha:</p>
      <ol>@for (field of chosen(); track field.key; let index = $index) {
        <li><span>{{ field.label }}</span><div>
          <button type="button" [disabled]="index === 0" [attr.aria-label]="'Mover ' + field.label + ' hacia el inicio'" (click)="move(index, -1)"><ion-icon name="arrow-up-outline" aria-hidden="true" />Subir</button>
          <button type="button" [disabled]="index === chosen().length - 1" [attr.aria-label]="'Mover ' + field.label + ' hacia el final'" (click)="move(index, 1)"><ion-icon name="arrow-down-outline" aria-hidden="true" />Bajar</button>
        </div></li>
      }</ol>
    }
  `,
  styles: `
    :host { display: block; } fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
    legend { color: var(--gam-color-heading); font-weight: 600; font-size: 1.1rem; }
    p, small { color: var(--gam-color-text-muted); } .choices { display: grid; gap: .6rem; }
    .field-choice { display: flex; align-items: center; border: 1px solid var(--gam-color-control-border); border-radius: .6rem; padding-right: .25rem; }
    label { flex: 1; min-width: 0; min-height: 52px; display: flex; align-items: center; gap: .8rem; padding: .7rem; cursor: pointer; }
    .field-choice:has(input:checked) { background: var(--gam-color-primary-soft); } input { width: 20px; height: 20px; flex: 0 0 20px; accent-color: var(--gam-color-primary); }
    small { display: block; margin-top: .2rem; } ol { padding-left: 1.5rem; } li { padding: .5rem 0; } li > span { display: inline-block; margin-bottom: .35rem; } li > div { display: flex; gap: .5rem; }
    button { min-height: 44px; padding: .4rem .8rem; border: 1px solid var(--gam-color-control-border); border-radius: .4rem; color: var(--gam-color-primary); background: var(--gam-color-surface); cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
    button { display: inline-flex; align-items: center; gap: .4rem; } ion-icon { font-size: 1rem; }
    :focus-visible { outline: 2px solid var(--gam-color-focus); outline-offset: 2px; }
    @media(min-width: 700px) { .choices { grid-template-columns: repeat(2, minmax(0, 1fr)); } li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; } }
  `,
})
export class ReportFieldPickerComponent {
  constructor() { addIcons({ 'arrow-up-outline': arrowUpOutline, 'arrow-down-outline': arrowDownOutline }); }
  readonly title = input.required<string>();
  readonly hint = input.required<string>();
  readonly helpText = input('');
  readonly sourceKey = input('');
  readonly fields = input.required<(ReportField & { key: string })[]>();
  readonly selected = input.required<string[]>();
  readonly ordered = input(false);
  readonly selection = output<string[]>();
  readonly chosen = computed(() => this.selected().flatMap(key => { const field = this.fields().find(item => item.key === key); return field ? [field] : []; }));
  readonly fieldHelp = computed(() => Object.fromEntries(this.fields().map(field => [field.key, reportFieldHelp(this.sourceKey(), field.key)])));

  toggle(key: string): void {
    this.selection.emit(this.selected().includes(key) ? this.selected().filter(item => item !== key) : [...this.selected(), key]);
  }

  move(index: number, direction: number): void {
    const next = [...this.selected()]; const destination = index + direction;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    this.selection.emit(next);
  }
}
