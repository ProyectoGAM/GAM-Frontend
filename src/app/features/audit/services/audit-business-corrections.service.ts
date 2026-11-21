import { Injectable, inject } from '@angular/core';
import { CustomersApi } from '../../customers/services/customers.api';
import { VehiclesApi } from '../../vehicles/services/vehicles.api';
import { businessCorrection } from './audit-actions';

type BusinessCorrection = NonNullable<ReturnType<typeof businessCorrection>>;

@Injectable({ providedIn: 'root' })
export class AuditBusinessCorrectionsService {
  private readonly customers = inject(CustomersApi);
  private readonly vehicles = inject(VehiclesApi);

  submit(action: BusinessCorrection, reason: string, reading: string, key: string) {
    switch (action.kind) {
      case 'reverse_customer_movement':
        return this.customers.reverse(action.customerId, action.id, reason, key);
      case 'cancel_vehicle_maintenance':
        return this.vehicles.transitionMaintenance(action.id, 'anulacion', { version: action.version, reason }, key);
      case 'correct_vehicle_reading':
        return this.vehicles.reading(action.vehicleId, {
          meter_type: 'odometer',
          event_type: 'correction',
          corrects_reading_id: action.id,
          value: reading,
          correction_reason: reason,
        }, key);
    }
  }
}
