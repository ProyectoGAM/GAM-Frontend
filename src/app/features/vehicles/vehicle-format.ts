import { VehicleAvailability, VehicleStatus } from './types/vehicle.types';

const fuelLitersFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });
const fuelVolumeFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 3 });
const measureFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 });
const uruguayDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function formatFuelLiters(liters: string | number): string {
  const value = Number(liters);
  return Number.isFinite(value) ? fuelLitersFormatter.format(value) : '—';
}

export function formatFuelVolume(liters: string): string | null {
  return liters && Number.isFinite(Number(liters)) ? `${fuelVolumeFormatter.format(Number(liters))} l` : null;
}

export function formatVehicleMeasure(value: string | null, unit: 'km' | 'kg'): string | null {
  return value && Number.isFinite(Number(value)) ? `${measureFormatter.format(Number(value))} ${unit}` : null;
}

export function vehicleStatusLabel(status: VehicleStatus): string {
  return status === 'active' ? 'Activo' : status === 'out_of_service' ? 'Fuera de servicio' : 'Retirado';
}

export function vehicleAvailabilityLabel(value: VehicleAvailability): string {
  return value === 'available' ? 'Disponible' : value === 'in_use' ? 'En uso' : 'No disponible';
}

export function vehicleDocumentExpired(expiresAt: string | null, now = new Date()): boolean {
  return expiresAt !== null && expiresAt < uruguayDateFormatter.format(now);
}
