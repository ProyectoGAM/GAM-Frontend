import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../core/config/api.config';
import { DeliveriesApi } from './deliveries.api';

describe('DeliveriesApi', () => {
  let api: DeliveriesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DeliveriesApi,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } },
      ],
    });
    api = TestBed.inject(DeliveriesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the start command with idempotency protection', () => {
    api.start({ quantity: 120, pin: '0007' }, 'start-key').subscribe();

    const request = http.expectOne('/api/v1/repartos');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('start-key');
    expect(request.request.body).toEqual({ quantity: 120, pin: '0007' });
    request.flush({ data: { id: 'delivery-1' } });
  });

  it('uses the current, detail, location and close endpoints', () => {
    api.current().subscribe();
    api.detail('delivery-1').subscribe();
    api.locations('delivery-1', []).subscribe();
    api.close('delivery-1', { returned_quantity: 0, pin: '0007' }, 'close-key').subscribe();

    http.expectOne('/api/v1/repartos/actuales').flush({ data: [] });
    http.expectOne('/api/v1/repartos/delivery-1').flush({ data: {} });
    http.expectOne('/api/v1/repartos/delivery-1/ubicaciones/lote').flush({ data: {} });
    const close = http.expectOne('/api/v1/repartos/delivery-1/cierre');
    expect(close.request.headers.get('Idempotency-Key')).toBe('close-key');
    expect(close.request.body).toEqual({ returned_quantity: 0, pin: '0007' });
    close.flush({ data: {} });
  });

  it('lists clients independently of the route and adds an idempotent load', () => {
    api.clients('Ombú').subscribe();
    api.clients().subscribe();
    api.units().subscribe();
    api.load('delivery-1', { quantity: 30 }, 'load-key').subscribe();

    const clientRequests = http.match((request) => request.url === '/api/v1/repartos/clientes');
    expect(clientRequests).toHaveLength(2);
    const [clients, emptySearch] = clientRequests;
    expect(clients.request.params.get('search')).toBe('Ombú');
    expect(clients.request.params.get('limit')).toBe('50');
    clients.flush({ data: [] });

    expect(emptySearch.request.params.has('search')).toBe(false);
    emptySearch.flush({ data: [] });
    http.expectOne('/api/v1/repartos/unidades').flush({ data: [] });

    const load = http.expectOne('/api/v1/repartos/delivery-1/cargas');
    expect(load.request.method).toBe('POST');
    expect(load.request.headers.get('Idempotency-Key')).toBe('load-key');
    expect(load.request.body).toEqual({ quantity: 30 });
    load.flush({ data: { id: 'delivery-1' } });
  });

  it('filters both current and historical delivery requests by the selected production unit', () => {
    api.current({ production_unit_id: 17 }).subscribe();
    api.list({ per_page: 50, production_unit_id: 17 }).subscribe();

    const current = http.expectOne('/api/v1/repartos/actuales?production_unit_id=17');
    expect(current.request.method).toBe('GET');
    current.flush({ data: [] });
    const history = http.expectOne('/api/v1/repartos?per_page=50&production_unit_id=17');
    expect(history.request.method).toBe('GET');
    history.flush({ data: [] });
  });
});
