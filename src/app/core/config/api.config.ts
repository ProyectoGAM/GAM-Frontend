import { InjectionToken } from '@angular/core';

export interface ApiConfig {
  baseUrl: string;
  webOrigin?: string;
}

export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG');
