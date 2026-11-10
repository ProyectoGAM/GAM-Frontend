import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { formatUyuMoney } from '../../../shared/utils/uyu-money';
import { DeliveryClient, DeliveryStopStatus } from '../delivery.models';

@Component({
  selector: 'app-delivery-client-row',
  imports: [IonIcon],
  template: `              <button type="button" class="client-row" [class.visited]="status() !== 'pending' || paid()" (click)="selected.emit()" [disabled]="disabled()">
                <span class="client-number" aria-hidden="true"><ion-icon name="location-outline" /></span>
                <span class="client-info"><strong>{{ client().name }}</strong><small>{{ client().address || "Sin dirección" }}</small>@if (client().account) { <small class="account-amount">{{ client().account!.balance.startsWith("-") ? "Saldo a favor" : "Deuda confirmada" }}: {{ money(client().account!.balance.startsWith("-") ? client().account!.credit : client().account!.debt) }}</small> }@if (client().status === "inactive") { <small>Inactivo · sólo cobros</small> }@if (status() !== 'pending') { <em>{{ status() === 'delivered' ? 'Visitado · Entregado' : 'Visitado · Sin entrega' }}</em> }@if (paid()) { <small>Cobro registrado</small> }</span>
                <ion-icon [name]="status() === 'pending' ? 'location-outline' : 'checkmark-circle-outline'" aria-hidden="true" />
              </button>`,
  styles: `:host { display: block; } .client-row{display:grid;grid-template-columns:42px 1fr 22px;align-items:center;gap:11px;min-height:83px;padding:11px;border-left:4px solid var(--gam-color-primary);text-align:left}.client-row:disabled{opacity:1}.client-row.visited{border-left-color:var(--gam-color-success)}
.client-number{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;color:var(--gam-color-on-primary);background:var(--gam-color-primary)}.client-info{min-width:0;display:grid;gap:2px}.client-info strong{font-size:15px}.client-info small{overflow:hidden;color:var(--gam-color-text-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.client-info em{color:var(--gam-color-primary);font-size:11px;font-style:normal}.client-row.visited em{color:var(--gam-color-success)}
 .client-info .account-amount { white-space: normal; overflow: visible; overflow-wrap: anywhere; } .client-row { width: 100%; border: 1px solid var(--gam-color-border); border-left: 4px solid var(--gam-color-primary); border-radius: 10px; background: var(--gam-color-surface); color: var(--gam-color-text); } button:focus-visible { outline: 3px solid var(--gam-color-focus); outline-offset: 2px; }`,
})
export class DeliveryClientRowComponent {
  readonly client = input.required<DeliveryClient>();
  readonly status = input<DeliveryStopStatus>('pending');
  readonly paid = input(false);
  readonly disabled = input(false);
  readonly selected = output<void>();
  readonly money = formatUyuMoney;
}
