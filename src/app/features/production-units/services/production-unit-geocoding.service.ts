import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';

import { MAPBOX_ACCESS_TOKEN } from '../../../core/config/mapbox.config';
import { ProductionUnitAdministrativeContext } from '../interfaces/production-unit.interface';

export interface MapboxPlace {
  id: string;
  place_name: string;
  center: [number, number];
  text?: string;
  place_type?: string[];
  context?: Array<{ id: string; text: string }>;
  administrativeContext?: ProductionUnitAdministrativeContext | null;
}

interface MapboxGeocodingResponse {
  features: MapboxPlace[];
}

export interface ProductionUnitSearchContext {
  department?: string | null;
  locality?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProductionUnitGeocodingService {
  // Mapbox is an external API; GAM's ApiClient remains limited to its own backend.
  private readonly http = inject(HttpClient);
  private readonly accessToken = inject(MAPBOX_ACCESS_TOKEN, { optional: true }) ?? '';
  private readonly endpoint = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

  search(query: string, context: ProductionUnitSearchContext): Observable<MapboxPlace[]> {
    if (!this.accessToken.trim()) return throwError(() => new Error('Mapbox token is not configured.'));
    const contextualQuery = [query.trim(), context.locality, context.department]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(', ');

    return this.http.get<MapboxGeocodingResponse>(
      `${this.endpoint}/${encodeURIComponent(contextualQuery)}.json`,
      { params: this.params({ autocomplete: 'true', limit: '5', country: 'UY', proximity: '-56.1645,-34.9011' }) },
    ).pipe(map((response) => (response.features ?? []).map((place) => this.withAdministrativeContext(place))));
  }

  reverse(latitude: number, longitude: number): Observable<MapboxPlace[]> {
    if (!this.accessToken.trim()) return throwError(() => new Error('Mapbox token is not configured.'));
    // Mapbox receives [longitude, latitude] even though the GAM API names the fields latitude/longitude.
    return this.http.get<MapboxGeocodingResponse>(
      `${this.endpoint}/${longitude},${latitude}.json`,
      { params: this.params({ limit: '1', country: 'UY', proximity: '-56.1645,-34.9011' }) },
    ).pipe(map((response) => (response.features ?? []).map((place) => this.withAdministrativeContext(place))));
  }

  private withAdministrativeContext(place: MapboxPlace): MapboxPlace {
    const entries = place.context ?? [];
    const department = entries.find((entry) => entry.id.startsWith('region.'))?.text ?? null;
    const locality = entries.find((entry) => /^(place|locality)\./.test(entry.id))?.text
      ?? (place.place_type?.includes('place') ? place.text ?? null : null);
    return { ...place, administrativeContext: locality && department ? { locality, department } : null };
  }

  private params(options: Record<string, string>) {
    return {
      ...options,
      language: 'es',
      access_token: this.accessToken,
    };
  }
}
