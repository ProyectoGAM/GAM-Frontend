import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MAPBOX_ACCESS_TOKEN } from '../../../core/config/mapbox.config';
import { ProductionUnitGeocodingService } from './production-unit-geocoding.service';

describe('ProductionUnitGeocodingService', () => {
  let service: ProductionUnitGeocodingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAPBOX_ACCESS_TOKEN, useValue: 'configured-for-unit-test' },
      ],
    });
    service = TestBed.inject(ProductionUnitGeocodingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('restricts address search to Uruguay and applies selected geography as context', () => {
    let results: unknown;
    service.search('Ruta 8', { locality: 'Las Piedras', department: 'Canelones' }).subscribe((places) => (results = places));

    const request = http.expectOne((candidate) => candidate.url.includes('/Ruta%208%2C%20Las%20Piedras%2C%20Canelones.json'));
    expect(request.request.params.get('proximity')).toBe('-56.1645,-34.9011');
    expect(request.request.params.get('language')).toBe('es');
    expect(request.request.params.get('autocomplete')).toBe('true');
    expect(request.request.params.get('country')).toBe('UY');
    request.flush({ features: [{
      id: 'address.1', place_name: 'Ruta 8, Las Piedras', center: [-56.2, -34.9],
      context: [{ id: 'place.8', text: 'Las Piedras' }, { id: 'region.3', text: 'Canelones' }],
    }] });

    expect(results).toEqual([{
      id: 'address.1', place_name: 'Ruta 8, Las Piedras', center: [-56.2, -34.9],
      context: [{ id: 'place.8', text: 'Las Piedras' }, { id: 'region.3', text: 'Canelones' }],
      administrativeContext: { locality: 'Las Piedras', department: 'Canelones' },
    }]);
  });

  it('sends reverse geocoding coordinates to Mapbox as longitude then latitude', () => {
    service.reverse(-34.9, -56.2).subscribe();

    const request = http.expectOne('https://api.mapbox.com/geocoding/v5/mapbox.places/-56.2,-34.9.json?limit=1&country=UY&proximity=-56.1645,-34.9011&language=es&access_token=configured-for-unit-test');
    expect(request.request.method).toBe('GET');
    request.flush({ features: [] });
  });
});
