import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup } from '@angular/forms';

import { applyInventoryValidationErrors, inventoryErrorMessage } from './inventory-errors';

describe('Inventory error messages', () => {
  it('gives a recoverable message when the server cannot be reached', () => {
    const error = new HttpErrorResponse({ status: 0 });

    expect(inventoryErrorMessage(error)).toBe('No se pudo conectar con el servidor. Intentá nuevamente.');
  });

  it('keeps a human message from a known backend conflict and uses a safe fallback otherwise', () => {
    const conflict = new HttpErrorResponse({ status: 409, error: { message: 'El movimiento cambió de versión o ya fue cancelado.' } });
    const unknown = new HttpErrorResponse({ status: 409, error: { code: 'UNMAPPED_CODE', message: '' } });

    expect(inventoryErrorMessage(conflict)).toBe('El movimiento cambió de versión o ya fue cancelado.');
    expect(inventoryErrorMessage(unknown)).toBe('La operación entró en conflicto con el estado actual.');
  });

  it('applies known validation fields to their form controls', () => {
    const form = new FormGroup({ quantity: new FormControl('') });
    const error = new HttpErrorResponse({ status: 422, error: { errors: { quantity: ['La cantidad debe ser mayor que cero.'] } } });

    applyInventoryValidationErrors(form, error);

    expect(form.controls.quantity.errors).toEqual({ server: 'La cantidad debe ser mayor que cero.' });
  });
});
