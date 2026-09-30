import { HttpErrorResponse } from '@angular/common/http';
import { FormGroup } from '@angular/forms';

import { ApiProblem } from '../../../core/auth/auth.types';

export function inventoryErrorMessage(error: unknown, fallback = 'No se pudo completar la operación.'): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error ? error.message : fallback;
  }

  const problem = typeof error.error === 'object' && error.error !== null
    ? error.error as ApiProblem
    : {};
  const message = typeof problem.message === 'string' && problem.message.trim() ? problem.message : undefined;
  const detail = typeof problem.detail === 'string' && problem.detail.trim() ? problem.detail : undefined;
  if (error.status === 0) return 'No se pudo conectar con el servidor. Intentá nuevamente.';
  if (error.status === 401) return 'La sesión expiró. Vuelve a iniciar sesión.';
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.';
  if (error.status === 404) return 'El recurso solicitado no fue encontrado.';
  if (error.status === 409) return message ?? 'La operación entró en conflicto con el estado actual.';
  if (error.status === 422) return message ?? 'Revisa los datos ingresados.';
  if (error.status >= 500) return 'El servidor no pudo completar la operación.';

  return message ?? detail ?? fallback;
}

export function applyInventoryValidationErrors(form: FormGroup, error: unknown): void {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) return;
  const problem = typeof error.error === 'object' && error.error !== null
    ? error.error as ApiProblem
    : {};
  for (const [field, messages] of Object.entries(problem.errors ?? {})) {
    const control = form.get(field);
    if (control) control.setErrors({ ...(control.errors ?? {}), server: messages.join(' ') });
  }
}
