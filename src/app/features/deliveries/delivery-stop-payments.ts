import { parseUyuAmount } from '../../shared/utils/uyu-money';
import type { CustomerMovement } from '../customers/interfaces/customer';
import type { Delivery } from './delivery.models';

export function paymentsByDeliveryStop(delivery: Delivery): Map<number, CustomerMovement[]> {
  const movements = new Map<string, CustomerMovement>();
  for (const stop of delivery.stops ?? []) {
    for (const movement of stop.account_movements ?? []) movements.set(movement.id, movement);
  }
  for (const movement of delivery.account_movements ?? []) movements.set(movement.id, movement);
  const payments = new Map<number, CustomerMovement[]>();
  for (const movement of movements.values()) {
    const stopId = movement.delivery_stop_id;
    if (!stopId || movement.type !== 'payment' || movement.reversal_id) continue;
    const linked = payments.get(stopId) ?? [];
    linked.push(movement);
    payments.set(stopId, linked);
  }
  return payments;
}

export function collectedForDeliveryStop(payments: readonly CustomerMovement[]): bigint {
  return payments.reduce((total, payment) => total - (parseUyuAmount(payment.amount) ?? 0n), 0n);
}
