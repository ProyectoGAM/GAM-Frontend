import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatUyuMoney } from '../../../shared/utils/uyu-money';
import { DeliveryFinancialSummary } from '../delivery.models';

@Component({
  selector: 'app-delivery-financial-summary',
  imports: [RouterLink],
  template: `
    @if (summary(); as data) {
      <article aria-label="Resumen de dinero">
        <h3>{{ title() }}</h3>
        <dl>
          <div><dt>Mercadería entregada</dt><dd class="money">{{ money(data.merchandise_amount) }}</dd></div>
          <div><dt>Dinero cobrado</dt><dd [class.money]="data.collected_amount !== null">{{ data.collected_amount === null ? 'Cobros históricos sin conciliar' : money(data.collected_amount) }}</dd></div>
          <div><dt>Efectivo</dt><dd class="money">{{ money(data.by_method.cash) }}</dd></div>
          <div><dt>Transferencia</dt><dd class="money">{{ money(data.by_method.transfer) }}</dd></div>
          <div><dt>Otro</dt><dd class="money">{{ money(data.by_method.other) }}</dd></div>
          <div><dt>Variación de cuentas</dt><dd class="money">{{ money(data.account_delta) }}</dd></div>
        </dl>
        @if (data.legacy_unreconciled_count > 0) { <p>{{ data.legacy_unreconciled_count }} entregas anteriores no tienen datos de cobro. Cobros registrados: {{ money(data.recorded_collected_amount) }}.</p> }
        @if (data.customers.length) {
          <details class="customer-breakdown">
            <summary>Detalle por cliente <span>{{ data.customers.length }} clientes</span></summary>
            @for (customer of data.customers; track customer.customer_id) {
              <section>
                @if (customerLinks()) { <a [routerLink]="['/administracion/clientes/clientes', customer.customer_id]">{{ customer.customer_name }}</a> }
                @else { <strong>{{ customer.customer_name }}</strong> }
                <dl><div><dt>Mercadería</dt><dd class="money">{{ money(customer.merchandise_amount) }}</dd></div>
                  <div><dt>Cobrado</dt><dd class="money">{{ money(customer.collected_amount) }}</dd></div>
                  <div><dt>Saldo anterior de la operación</dt><dd class="money">{{ money(customer.balance_before) }}</dd></div>
                  <div><dt>Saldo posterior de la operación</dt><dd class="money">{{ money(customer.balance_after) }}</dd></div></dl>
              </section>
            }
          </details>
        }
        <p>Los saldos corresponden a las operaciones de este reparto. La cuenta del cliente muestra su saldo vigente.</p>
      </article>
    }
  `,
  styles: `
    :host { display: block; }
    article { margin: 16px 0; padding: 16px; border: 1px solid var(--gam-color-border); border-radius: 10px; background: var(--gam-color-surface); color: var(--gam-color-text); }
    h3 { margin-top: 0; color: var(--gam-color-heading); }
    dl { margin: 0; } dl div { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px 12px; padding: 10px 0; border-bottom: 1px solid var(--gam-color-border); }
    dd { flex: 0 1 52%; min-width: 0; margin: 0; font-weight: 700; text-align: right; overflow-wrap: anywhere; }
    dd.money { flex: 0 0 auto; max-width: 52%; white-space: nowrap; overflow-wrap: normal; } dt { flex: 1 1 auto; min-width: 0; }
    .customer-breakdown { margin-top: 12px; border-top: 1px solid var(--gam-color-border); }
    .customer-breakdown summary { min-height: 48px; padding: 12px 4px; color: var(--gam-color-heading); font-weight: 700; cursor: pointer; }
    .customer-breakdown[open] summary { border-bottom: 1px solid var(--gam-color-border); }
    .customer-breakdown section { margin: 12px 0 20px; }
    a { display: inline-flex; align-items: center; min-height: 44px; color: var(--gam-color-primary); }
    p { color: var(--gam-color-text-muted); font-size: .85rem; line-height: 1.5; }
  `,
})
export class DeliveryFinancialSummaryComponent {
  readonly summary = input<DeliveryFinancialSummary | null | undefined>();
  readonly title = input('Dinero y cuentas');
  readonly customerLinks = input(false);
  readonly money = formatUyuMoney;
}
