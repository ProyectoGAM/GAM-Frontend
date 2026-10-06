const wholeFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 });

/** Formatea el texto decimal del servidor sin perder precisión ni redondear. */
export function formatDeliveryMoney(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return 'Sin detalle de precios';
  const text = String(amount);
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return 'Importe no disponible';
  const [whole, fraction = ''] = text.split('.');
  const decimals = fraction.replace(/0+$/, '');
  return `${wholeFormatter.format(BigInt(whole))}${decimals ? ',' + decimals : ''} UYU`;
}
