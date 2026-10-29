import { formatUyuMoney } from '../../shared/utils/uyu-money';

/** Conserva el mensaje histórico para repartos sin detalle de precios. */
export function formatDeliveryMoney(amount: string | number | null | undefined): string {
  return amount === null || amount === undefined ? 'Sin detalle de precios' : formatUyuMoney(amount);
}
