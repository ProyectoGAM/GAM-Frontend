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
          <div><dt>Mercadería entregada</dt><dd>{{ money(data.merchandise_amount) }}</dd></div>
          <div><dt>Dinero cobrado</dt><dd>{{ data.collected_amount === null ? 'Cobros históricos sin conciliar' : money(data.collected_amount) }}</dd></div>
          <div><dt>Efectivo</dt><dd>{{ money(data.by_method.cash) }}</dd></div>
          <div><dt>Transferencia</dt><dd>{{ money(data.by_method.transfer) }}</dd></div>
          <div><dt>Otro</dt><dd>{{ money(data.by_method.other) }}</dd></div>
          <div><dt>Variación de cuentas</dt><dd>{{ money(data.account_delta) }}</dd></div>
        </dl>
        @if (data.legacy_unreconciled_count > 0) { <p>{{ data.legacy_unreconciled_count }} entregas anteriores no tienen datos de cobro. Cobros registrados: {{ money(data.recorded_collected_amount) }}.</p> }
        @for (customer of data.customers; track customer.customer_id) {
          <section>
            @if (customerLinks()) { <a [routerLink]="['/administracion/clientes/clientes', customer.customer_id]">{{ customer.customer_name }}</a> }
            @else { <strong>{{ customer.customer_name }}</strong> }
            <dl><div><dt>Mercadería</dt><dd>{{ money(customer.merchandise_amount) }}</dd></div>
              <div><dt>Cobrado</dt><dd>{{ money(customer.collected_amount) }}</dd></div>
              <div><dt>Saldo anterior de la operación</dt><dd>{{ money(customer.balance_before) }}</dd></div>
              <div><dt>Saldo posterior de la operación</dt><dd>{{ money(customer.balance_after) }}</dd></div></dl>
          </section>
        }
        <p>Los saldos corresponden a las operaciones de este reparto. La cuenta del cliente muestra su saldo vigente.</p>
      </article>
    }
  `,
  styles: `
    :host { display: block; }
    article { margin: 16px 0; padding: 16px; border: 1px solid var(--gam-color-border); border-radius: 10px; background: var(--gam-color-surface); color: var(--gam-color-text); }
    h3 { margin-top: 0; color: var(--gam-color-heading); }
    dl { margin: 0; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--gam-color-border); }
    dd { margin: 0; font-weight: 700; text-align: right; overflow-wrap: anywhere; } dt { min-width: 0; }
    section { margin-top: 20px; } a { display: inline-flex; align-items: center; min-height: 44px; color: var(--gam-color-primary); }
    p { color: var(--gam-color-text-muted); font-size: .85rem; line-height: 1.5; }
  `,
})
export class DeliveryFinancialSummaryComponent {
  readonly summary = input<DeliveryFinancialSummary | null | undefined>();
  readonly title = input('Dinero y cuentas');
  readonly customerLinks = input(false);
  readonly money = formatUyuMoney;
}
