import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { API_CONFIG } from '../config/api.config';
import { AuthStore } from './auth.store';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(API_CONFIG);
  const store = inject(AuthStore);
  const origin = globalThis.location?.origin ?? 'http://localhost';
  const apiUrl = new URL(config.baseUrl, origin);
  const requestUrl = new URL(request.url, origin);
  const apiPath = apiUrl.pathname.replace(/\/+$/, '');

  if (requestUrl.origin !== apiUrl.origin
    || !requestUrl.pathname.startsWith(apiPath + '/')) {
    return next(request);
  }

  let secured = request;
  const headers: Record<string, string> = {};

  const sessionId = store.sharedSessionId();

  if (store.storageIsNative()) {
    const token = store.bearerToken();
    const deviceToken = store.sharedDeviceToken();

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    if (deviceToken) {
      headers['X-Shared-Device-Token'] = deviceToken;
    }
    if (sessionId) {
      headers['X-GAM-Session'] = sessionId;
    }
  } else {
    secured = secured.clone({ withCredentials: true });
  }

  if (sessionId) {
    headers['X-GAM-Session'] = sessionId;
  }

  for (const [name, value] of Object.entries(headers)) {
    secured = secured.clone({ setHeaders: { [name]: value } });
  }

  return next(secured).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        store.handleHttpError(error, request.url);
      }
      return throwError(() => error);
    }),
  );
};
