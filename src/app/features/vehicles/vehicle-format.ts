const fuelLitersFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });

export function formatFuelLiters(liters: string | number): string {
  const value = Number(liters);
  return Number.isFinite(value) ? fuelLitersFormatter.format(value) : '—';
}
