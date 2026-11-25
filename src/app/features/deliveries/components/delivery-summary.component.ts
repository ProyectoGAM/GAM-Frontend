import { DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { uyuDecimal } from '../../../shared/utils/uyu-money';
import { formatDeliveryMoney } from '../delivery-money';
import type { Delivery } from '../delivery.models';
import { collectedForDeliveryStop, paymentsByDeliveryStop } from '../delivery-stop-payments';

@Component({
  selector: 'app-delivery-summary',
  imports: [DatePipe],
  templateUrl: './delivery-summary.component.html',
  styleUrl: './delivery-summary.component.scss',
})
export class DeliverySummaryComponent {
  readonly delivery = input.required<Delivery>();
  readonly canEdit = input(false);
  readonly editRequested = output<number>();
  protected readonly search = signal('');
  protected readonly money = formatDeliveryMoney;
  protected readonly deliveries = computed(() => {
    const delivery = this.delivery();
    return (delivery.stops ?? []).filter((stop) => stop.status === 'delivered')
      .sort((left, right) => (Date.parse(right.visited_at ?? right.created_at ?? '') || 0)
        - (Date.parse(left.visited_at ?? left.created_at ?? '') || 0) || right.sequence - left.sequence);
  });
  protected readonly rows = computed(() => {
    const query = searchable(this.search().trim());
    const byStop = paymentsByDeliveryStop(this.delivery());
    return this.deliveries().filter((stop) => searchable(stop.client_name).includes(query)).map((stop) => {
      const paid = collectedForDeliveryStop(byStop.get(stop.id) ?? []);
      const payment = paid > 0n ? `Cobrado ${this.money(uyuDecimal(paid))}`
        : stop.accounting_status === 'posted' ? 'Sin cobro'
          : stop.id < 0 ? 'Pendiente de sincronizar' : 'Cobro sin conciliar';
      const editable = stop.id > 0 && (!!stop.version && stop.delivered_quantity > 0 || stop.accounting_status === 'posted' || paid > 0n);
      return { stop, payment, paid: paid > 0n, editable };
    });
  });
}

function searchable(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-UY');
}
