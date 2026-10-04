import { AbstractControl, ValidationErrors } from '@angular/forms';

import { ProductionUnitLocationValue } from '../interfaces/production-unit.interface';

export function isValidProductionUnitPoint(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

export function productionUnitLocationPointValidator(control: AbstractControl): ValidationErrors | null {
  const location = control.value as ProductionUnitLocationValue | null;
  if (!location) return { required: true };
  return isValidProductionUnitPoint(location.latitude, location.longitude) ? null : { coordinates: true };
}
