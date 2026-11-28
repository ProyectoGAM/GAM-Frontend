import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDownOutline, timeOutline } from 'ionicons/icons';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { DeliveriesApi } from '../deliveries.api';
import { formatDeliveryMoney } from '../delivery-money';
import type { DeliveryClient, DeliveryPaymentMethod } from '../delivery.models';

@Component({
  selector: 'app-delivery-client-history',
  imports: [DatePipe, IonIcon],
  templateUrl: './delivery-client-history.component.html',
  styleUrl: './delivery-client-history.component.scss',
})
export class DeliveryClientHistoryComponent {
  private readonly api = inject(DeliveriesApi);
  private readonly attempt = signal(0);
  readonly client = input.required<DeliveryClient>();
  readonly online = input.required<boolean>();
  readonly expanded = signal(false);
  readonly money = formatDeliveryMoney;
  readonly methods: Record<DeliveryPaymentMethod, string> = {
    cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque', other: 'Otro',
  };

  private readonly request = computed(() => this.expanded() && this.online()
    ? { clientId: this.client().id, attempt: this.attempt() }
    : null);
  readonly history = toSignal(toObservable(this.request).pipe(
    switchMap((request) => request === null ? of(null) : this.api.clientHistory(request.clientId).pipe(
      map(({ data }) => ({ state: 'ready' as const, data })),
      startWith({ state: 'loading' as const }),
      catchError(() => of({ state: 'error' as const })),
    )),
  ));

  constructor() {
    addIcons({ chevronDownOutline, timeOutline });
  }

  retry(): void {
    this.attempt.update((attempt) => attempt + 1);
  }
}
