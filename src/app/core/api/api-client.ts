import { HttpClient, HttpHeaders, HttpParams, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';

import { API_CONFIG } from '../config/api.config';
import { ApiOptions } from './api-options.type';

@Injectable({
  providedIn: 'root',
})
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  private readonly defaultBaseUrl = this.apiConfig.baseUrl;

  private readonly defaultHeaders = new HttpHeaders({
    Accept: 'application/json',
  });

  get<T>(path: string, options: ApiOptions = {}): Observable<T> {
    return this.http.get<T>(this.url(path, options.baseUrl), {
      headers: this.buildHeaders(options.headers),
      params: this.buildParams(options.params),
      context: options.context,
      withCredentials: options.withCredentials,
    });
  }

  getFile(path: string, options: ApiOptions = {}): Observable<HttpResponse<Blob>> {
    return this.http.get(this.url(path, options.baseUrl), {
      headers: this.buildHeaders({ Accept: 'application/octet-stream', ...options.headers }),
      params: this.buildParams(options.params), context: options.context,
      withCredentials: options.withCredentials, responseType: 'blob', observe: 'response',
    }).pipe(catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.error instanceof Blob && error.error.type.includes('json')) {
        return from(error.error.text()).pipe(mergeMap((text) => {
          let problem: unknown;
          try { problem = JSON.parse(text); } catch { return throwError(() => error); }
          return throwError(() => new HttpErrorResponse({ error: problem, status: error.status, statusText: error.statusText, headers: error.headers, url: error.url ?? undefined }));
        }));
      }
      return throwError(() => error);
    }));
  }

  post<TResponse, TBody = unknown>(
    path: string,
    body: TBody,
    options: ApiOptions = {},
  ): Observable<TResponse> {
    return this.http.post<TResponse>(
      this.url(path, options.baseUrl),
      body,
      {
        headers: this.buildHeaders(options.headers),
        params: this.buildParams(options.params),
        context: options.context,
        withCredentials: options.withCredentials,
      },
    );
  }

  put<TResponse, TBody = unknown>(
    path: string,
    body: TBody,
    options: ApiOptions = {},
  ): Observable<TResponse> {
    return this.http.put<TResponse>(
      this.url(path, options.baseUrl),
      body,
      {
        headers: this.buildHeaders(options.headers),
        params: this.buildParams(options.params),
        context: options.context,
        withCredentials: options.withCredentials,
      },
    );
  }

  patch<TResponse, TBody = unknown>(
    path: string,
    body: TBody,
    options: ApiOptions = {},
  ): Observable<TResponse> {
    return this.http.patch<TResponse>(
      this.url(path, options.baseUrl),
      body,
      {
        headers: this.buildHeaders(options.headers),
        params: this.buildParams(options.params),
        context: options.context,
        withCredentials: options.withCredentials,
      },
    );
  }

  delete<T>(path: string, options: ApiOptions = {}): Observable<T> {
    return this.http.delete<T>(this.url(path, options.baseUrl), {
      body: options.body,
      headers: this.buildHeaders(options.headers),
      params: this.buildParams(options.params),
      context: options.context,
      withCredentials: options.withCredentials,
    });
  }

  private url(path: string, overrideBaseUrl?: string): string {
    const base = (overrideBaseUrl ?? this.defaultBaseUrl).replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/+/, '');

    return `${base}/${cleanPath}`;
  }

  private buildHeaders(extra?: Record<string, string>): HttpHeaders {
    let headers = this.defaultHeaders;

    if (!extra) {
      return headers;
    }

    for (const [key, value] of Object.entries(extra)) {
      headers = headers.set(key, value);
    }

    return headers;
  }

  private buildParams(
    params?: Record<string, string | number | boolean | null | undefined>,
  ): HttpParams {
    let httpParams = new HttpParams();

    if (!params) {
      return httpParams;
    }

    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        continue;
      }

      httpParams = httpParams.set(key, String(value));
    }

    return httpParams;
  }
}
