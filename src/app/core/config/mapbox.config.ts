import { InjectionToken } from '@angular/core';

export const MAPBOX_ACCESS_TOKEN = new InjectionToken<string>('MAPBOX_ACCESS_TOKEN');

export function mapboxWorkerUrl(): string {
  return new URL('assets/mapbox/worker.js', document.baseURI).href;
}
