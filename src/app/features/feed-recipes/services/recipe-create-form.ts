import { AbstractControl, ValidationErrors } from '@angular/forms';

const MAX_GRAMS = 9223372036854775807n;

/** Accept local decimal input without ever rounding through a JS number. */
export function recipeGrams(kilograms: string): string | null {
  const value = kilograms.trim();
  if (value.length > 24 || !/^\d+(?:[.,]\d{1,3})?$/.test(value)) return null;
  const [integer, fraction = ''] = value.replace(',', '.').split('.');
  const grams = BigInt(integer) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return grams > 0n && grams <= MAX_GRAMS ? String(grams) : null;
}

export function recipeQuantity(control: AbstractControl): ValidationErrors | null {
  return recipeGrams(String(control.value ?? '')) ? null : { quantity: true };
}

export function recipeName(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { required: true };
}

export function distinctRecipeMaterials(control: AbstractControl): ValidationErrors | null {
  const rows = control.value as { producto_id: string }[];
  const ids = rows.map((row) => row.producto_id).filter(Boolean);
  return new Set(ids).size === ids.length ? null : { duplicate: true };
}
