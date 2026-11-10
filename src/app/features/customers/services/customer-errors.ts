import { HttpErrorResponse } from '@angular/common/http';

export function customerErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'No se pudo confirmar la operación. Revisá la conexión y reintentá conservando los datos originales.';
  const body: unknown = error.error;
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  if (record['errors'] && typeof record['errors'] === 'object') {
    for (const messages of Object.values(record['errors'])) {
      if (Array.isArray(messages) && typeof messages[0] === 'string') return messages[0];
    }
  }
  return typeof record['message'] === 'string' ? record['message'] : fallback;
}

export function hasUncertainCustomerResult(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}
