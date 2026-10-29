import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../../../core/config/api.config';
import { PendingFeedAdjustment } from '../interfaces/feed-adjustment.interface';
import { FeedAdjustmentService } from './feed-adjustment.service';

describe('FeedAdjustmentService', () => {
  const pending: PendingFeedAdjustment = { key: 'abbbbbbb-cccc-4ddd-8eee-ffffffffffff', productId: 2,
    request: { accion: 'establecer', valor_g: '0', motivo: 'Recuento físico' } };
  let service: FeedAdjustmentService;
  let http: HttpTestingController;
  const setup = (): void => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { baseUrl: '/api/v1' } }] });
    service = TestBed.inject(FeedAdjustmentService); http = TestBed.inject(HttpTestingController);
  };
  beforeEach(() => { sessionStorage.clear(); setup(); });
  afterEach(() => { http.verify(); sessionStorage.clear(); });

  it('sends the dedicated plant/product contract and header key without rounding or extra fields', () => {
    let result: unknown;
    service.adjust(12, pending).subscribe((response) => result = response);
    const request = http.expectOne('/api/v1/plantas-racion/12/ingredientes/2/ajustes');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(pending.request);
    expect(request.request.headers.get('Idempotency-Key')).toBe(pending.key);
    const data = { id: 4, planta_id: 12, producto_id: 2, saldo_resultante_g: '0.000000' };
    request.flush({ data }); expect(result).toEqual(data);
  });

  it('recovers pending requests after recreation, isolated by actor, session and plant', () => {
    service.rememberPending('1:session-a', 12, pending);
    http.verify(); TestBed.resetTestingModule(); setup();
    expect(service.readPending('1:session-a', 12)).toEqual(pending);
    expect(service.readPending('2:session-a', 12)).toBeNull();
    expect(service.readPending('1:session-b', 12)).toBeNull();
    expect(service.readPending('1:session-a', 13)).toBeNull();
    service.forgetPending('1:session-a', 12);
    expect(service.readPending('1:session-a', 12)).toBeNull();
  });

  it('ignores malformed or invalid persisted requests', () => {
    for (const request of [null, {}, { ...pending, key: 'invalid' },
      { ...pending, request: { ...pending.request, accion: 'restar' } },
      { ...pending, request: { ...pending.request, valor_g: '0.5' } },
      { ...pending, request: { ...pending.request, motivo: ' ' } }]) {
      sessionStorage.setItem('gam.feed-adjustment.pending.v1:1:personal:12', JSON.stringify(request));
      expect(service.readPending('1:personal', 12)).toBeNull();
    }
  });
});
