import { BaseUnit } from '../interfaces/inventory';

const UNIT_LABELS: Record<BaseUnit, string> = {
  unit: 'unidades',
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'ml',
  dose: 'dosis',
};

export function unitLabel(unit: BaseUnit | string): string {
  return UNIT_LABELS[unit as BaseUnit] ?? unit;
}

export function formatQuantity(value: string, unit?: BaseUnit | string): string {
  const [integerPart, fractionPart] = value.replace(/^\+/, '').split('.');
  const negative = integerPart.startsWith('-');
  const unsignedInteger = (negative ? integerPart.slice(1) : integerPart).replace(/^0+(?=\d)/, '');
  const grouped = unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (fractionPart ?? '').replace(/0+$/, '');
  const number = `${negative ? '-' : ''}${grouped}${fraction ? `,${fraction}` : ''}`;

  return unit ? `${number} ${unitLabel(unit)}` : number;
}

export function signedQuantity(value: string, unit?: BaseUnit | string): string {
  const sign = value.startsWith('-') ? '' : '+';
  return `${sign}${formatQuantity(value, unit)}`;
}

export function decimalCompare(left: string, right: string): number {
  const normalize = (value: string): [string, string, boolean] => {
    const negative = value.startsWith('-');
    const [integer = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
    return [integer.replace(/^0+(?=\d)/, ''), fraction.replace(/0+$/, ''), negative];
  };
  const a = normalize(left);
  const b = normalize(right);
  if (a[2] !== b[2]) return a[2] ? -1 : 1;
  const sign = a[2] ? -1 : 1;
  if (a[0].length !== b[0].length) return (a[0].length - b[0].length) * sign;
  if (a[0] !== b[0]) return (a[0] > b[0] ? 1 : -1) * sign;
  const max = Math.max(a[1].length, b[1].length);
  const af = a[1].padEnd(max, '0');
  const bf = b[1].padEnd(max, '0');
  return (af === bf ? 0 : af > bf ? 1 : -1) * sign;
}

export function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
