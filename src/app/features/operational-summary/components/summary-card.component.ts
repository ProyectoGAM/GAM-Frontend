import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { cashOutline, eggOutline, pulseOutline, walletOutline } from 'ionicons/icons';

const icons = {
  eggs: eggOutline,
  mortality: pulseOutline,
  birds: '',
  delivered: cashOutline,
  expenses: walletOutline,
};

@Component({
  selector: 'app-summary-card',
  imports: [IonIcon],
  template: `
    <div class="card-heading">
      <span class="icon" [class]="symbol()" aria-hidden="true">
        @if (symbol() === 'birds') {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 8c.8-2.7 1.6-4.5 4-4.5a3 3 0 0 1 2.9 2.9l1.3 1.2-2.4.5c0 5.4-2.5 9.4-7.4 9.4-4.8 0-8.7-3-9.8-7.6l-.6-2.6L6 9.1c1.5 1.3 3 1.8 4.4 1.8 1.8 0 3-1 4.1-2.9ZM11 17.5v3m4-3v3m-5 0h6M17.4 3.7l.5-1.6 1.5 1.5" />
            <path d="M18.9 6h.01" />
          </svg>
        } @else { <ion-icon [icon]="icon()" /> }
      </span>
      <div class="reading">
        <h3>{{ label() }}</h3>
        @switch (status()) {
          @case ('loading') { <p role="status">Cargando…</p> }
          @case ('forbidden') { <p>Sin permiso para consultar.</p> }
          @case ('error') { <p role="alert">No se pudo cargar este indicador.</p> }
          @default { <ng-content select="[summaryValue]" /> }
        }
      </div>
    </div>
    @switch (status()) {
      @case ('error') { <button type="button" (click)="retry.emit()">Reintentar</button> }
      @case ('loading') {}
      @case ('forbidden') {}
      @default { <div class="card-body"><ng-content /></div> }
    }
  `,
  styles: [`
    :host {
      display: flex; flex-direction: column; justify-content: center;
      gap: .3rem; min-width: 0; padding: .75rem 1rem;
    }
    .card-heading { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: .65rem; }
    .icon {
      display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: .48rem;
      color: var(--gam-color-primary); background: var(--gam-color-primary-soft);
    }
    .icon ion-icon, .icon svg { width: 1.25rem; height: 1.25rem; }
    .eggs { color: var(--gam-color-success); background: var(--gam-color-success-soft); }
    .mortality { color: var(--gam-color-danger); background: var(--gam-color-danger-soft); }
    .delivered { color: var(--gam-color-finance); background: var(--gam-color-finance-soft); }
    .reading { display: grid; gap: .15rem; overflow-wrap: anywhere; }
    h3, p { margin: 0; font-size: .8125rem; line-height: 1.2; }
    h3 { color: var(--gam-color-text); font-weight: 550; }
    p { color: var(--gam-color-text-muted); }
    .card-body { display: flex; flex-direction: column; gap: .2rem; }
    .card-body:empty { display: none; }
    button {
      align-self: flex-start; min-height: 44px; padding: 0; background: transparent;
      color: var(--gam-color-primary); font-weight: 650;
    }
    button:focus-visible { outline: 2px solid var(--gam-color-focus); outline-offset: 2px; }
  `],
})
export class SummaryCardComponent {
  readonly label = input.required<string>();
  readonly symbol = input.required<keyof typeof icons>();
  readonly status = input('ready');
  readonly retry = output<void>();
  protected readonly icon = computed(() => icons[this.symbol()]);
}
