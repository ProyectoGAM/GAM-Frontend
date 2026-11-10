import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { DeliveryOutboxEntry } from '../delivery-outbox.service';
import { formatUyuMoney } from '../../../shared/utils/uyu-money';
import { formatFuelLiters } from '../../vehicles/vehicle-format';
import { DeliveryClient } from '../delivery.models';

@Component({
  selector: 'app-delivery-pending-operations',
  imports: [DatePipe],
  template: `
    @if (entries().length) {
      <section aria-label="Operaciones pendientes"><h3>Pendientes en este dispositivo</h3><p>Estos importes todavía no forman parte del saldo confirmado.</p>
        <label for="review-customer">Cliente real para corregir una referencia antigua</label><select id="review-customer" #customer><option value="">Conservar cliente del evento</option>@for (client of clients(); track client.id) { <option [value]="client.id">{{ client.name }}</option> }</select>
        @for (entry of entries(); track entry.id) {
          <article><strong>{{ entry.kind === 'payment' ? 'Cobro' : entry.kind === 'stop' ? 'Visita' : entry.kind === 'load' ? 'Carga' : entry.kind === 'fuel' ? 'Combustible del vehículo' : entry.kind === 'close' ? 'Cierre anterior · confirmar con PIN' : 'Ubicaciones' }}</strong>
            <p>{{ description(entry) }}</p><small>{{ entry.createdAt | date:'short' }} · {{ entry.state === 'needs_review' ? 'Necesita revisión' : 'Pendiente de sincronizar' }}</small>
            @if (entry.error) { <p>{{ entry.error }}</p> }
            @if (entry.state === 'needs_review' && entry.kind !== 'close') {
              @if (entry.kind === 'load' || entry.kind === 'stop' || entry.kind === 'payment') { <button type="button" (click)="review.emit({ entry, customerId: customer.value })" [disabled]="busy()">Revisar datos</button> }
              <button type="button" (click)="retry.emit(entry)" [disabled]="!online() || busy()">Reintentar el mismo evento</button>
            }
          </article>
        }
      </section>
    }
  `,
  styles: `
    section { padding: 12px; border: 1px solid var(--gam-color-border); border-radius: 8px; background: var(--gam-color-surface-alt); }
    small { display: block; margin-top: 8px; color: var(--gam-color-text-muted); }
    article { border-top: 1px solid var(--gam-color-border); padding: 12px 0; overflow-wrap: anywhere; }
    button,select { min-height: 44px; padding: 8px 12px; border: 1px solid var(--gam-color-control-border); border-radius: 8px; color: var(--gam-color-primary); background: var(--gam-color-surface); font: inherit; }
    select { width: 100%; margin: 8px 0; } button { margin: 4px; }
    :is(button,select):focus-visible { outline: 3px solid var(--gam-color-focus); outline-offset: 2px; }
  `,
})
export class DeliveryPendingOperationsComponent {
  description(entry: DeliveryOutboxEntry): string {
    const payload = entry.payload;
    if (entry.kind === 'fuel') {
      const fuel = payload as import('../../vehicles/interfaces/vehicle').VehicleFuelInput;
      return `${formatFuelLiters(fuel.liters)} l · ${fuel.fuel_type} · Gasto ${formatUyuMoney(fuel.amount)}`;
    }
    const client = 'client_reference' in payload ? this.clients().find((value) => value.id === payload.client_reference)?.name ?? payload.client_reference : '';
    const amount = 'amount' in payload ? payload.amount : 'payment' in payload ? payload.payment?.amount : undefined;
    return `${client}${amount ? ' · Cobro pendiente: ' + formatUyuMoney(amount) : ''}`;
  }
  readonly entries = input<readonly DeliveryOutboxEntry[]>([]);
  readonly clients = input<readonly DeliveryClient[]>([]);
  readonly busy = input(false);
  readonly online = input(false);
  readonly review = output<{ entry: DeliveryOutboxEntry; customerId: string }>();
  readonly retry = output<DeliveryOutboxEntry>();
}
