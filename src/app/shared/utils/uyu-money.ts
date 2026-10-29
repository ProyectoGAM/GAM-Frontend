const wholeFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 });
const maximum = 9999999999999999999999n;

/** Convierte una entrada decimal a milésimos exactos, admitiendo coma en el formulario. */
export function parseUyuAmount(input: string): bigint | null {
  const text = input.trim().replace(',', '.');
  if (!/^-?\d{1,19}(?:\.\d{1,3})?$/.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const amount = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return amount > maximum ? null : negative ? -amount : amount;
}

export function uyuDecimal(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}${absolute / 1000n}.${String(absolute % 1000n).padStart(3, '0')}`;
}

/** Conserva hasta el tercer decimal y el signo, sin convertir el dinero a number. */
export function formatUyuMoney(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return 'Importe no disponible';
  const text = String(amount);
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(text)) return 'Importe no disponible';
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const decimals = fraction.replace(/0+$/, '');
  const formatted = wholeFormatter.format(BigInt(negative ? `-${whole}` : whole));
  const sign = negative && BigInt(whole) === 0n ? '−' : '';
  return `${sign}${formatted}${decimals ? ',' + decimals : ''} UYU`;
}
