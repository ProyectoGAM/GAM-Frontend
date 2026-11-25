import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { MAPBOX_ACCESS_TOKEN } from '../../core/config/mapbox.config';
import { AdminUnitContextService } from '../admin/services/admin-unit-context.service';
import { AdminDeliveriesPage } from './admin-deliveries.page';
import { adminDeliveriesRoutes } from './admin-deliveries.routes';
import { DeliveriesApi } from './deliveries.api';
import { Delivery, DeliveryListResponse } from './delivery.models';

const listPath = '/administracion/repartos/repartos';
const activeDelivery: Delivery = {
  id: 'delivery-1', status: 'active', driver: { id: 1, name: 'Lucía Méndez' },
  production_unit: null, vehicle_reference: 'STP 2145', loaded_quantity: 100, delivered_quantity: 20, returned_quantity: 0,
  remaining_quantity: 80, stops_summary: { total: 3, pending: 1, delivered: 1, not_delivered: 1 },
  started_at: '2026-11-24T14:00:00Z', closed_at: null, latest_location: null,
};
const completedDelivery: Delivery = {
  ...activeDelivery, id: 'delivery-2', status: 'completed', closed_at: '2026-11-24T16:00:00Z',
};

describe('AdminDeliveriesPage', () => {
  let current: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;
  let detail: ReturnType<typeof vi.fn>;
  let selectedId: ReturnType<typeof signal<number | null>>;

  beforeEach(() => {
    selectedId = signal<number | null>(7);
    current = vi.fn().mockReturnValue(of({ data: [activeDelivery] }));
    list = vi.fn().mockImplementation(({ status }) => of({
      data: status === 'completed' ? [completedDelivery] : [],
    }));
    detail = vi.fn().mockReturnValue(of({ data: completedDelivery }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'administracion/repartos/repartos', children: adminDeliveriesRoutes }]),
        { provide: AuthStore, useValue: { isAdmin: () => true, status: () => 'personal_authenticated', user: () => null } },
        { provide: AdminUnitContextService, useValue: { selectedId, selectedUnit: () => ({ id: 7, name: 'Granja Norte' }) } },
        { provide: DeliveriesApi, useValue: { current, list, detail } },
        { provide: MAPBOX_ACCESS_TOKEN, useValue: '' },
      ],
    });
  });

  it('lets history-only readers use the list without requesting live data', async () => {
    TestBed.overrideProvider(AuthStore, { useValue: {
      isAdmin: () => false, user: () => ({ permissions: ['can_view_delivery_history'] }),
    } });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(listPath, AdminDeliveriesPage);
    harness.detectChanges();
    expect(current).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ per_page: 100, production_unit_id: 7, status: 'completed' }));
    expect(page.rows()).toEqual([completedDelivery]);
    expect(harness.routeNativeElement?.textContent).not.toContain('En curso');
  });

  it('restores filters through the dedicated detail route and supports accents and separated plates', async () => {
    const url = listPath + '?vista=historial&buscar=lucia%20stp2145&desde=2026-11-21&estado=completed';
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(url, AdminDeliveriesPage);
    harness.detectChanges();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ date_from: '2026-11-21', status: 'completed' }));
    expect(page.rows()).toEqual([completedDelivery]);
    const detailLink = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('.detail-link');
    expect(detailLink?.getAttribute('href')).toContain(listPath + '/delivery-2?vista=historial&buscar=');
    await harness.navigateByUrl(detailLink!.getAttribute('href')!);
    expect(detail).toHaveBeenCalledWith(completedDelivery.id);
    expect(harness.routeNativeElement?.querySelector('.back-link')?.getAttribute('href')).toBe(url + '#reparto-delivery-2');
  });

  it('cancels the previous unit request and keeps the live list scoped to the selected unit', async () => {
    const unit7 = new Subject<DeliveryListResponse>();
    const unit12 = new Subject<DeliveryListResponse>();
    current.mockReturnValueOnce(unit7).mockReturnValueOnce(unit12);
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(listPath, AdminDeliveriesPage);
    selectedId.set(12);
    harness.detectChanges();

    unit7.next({ data: [activeDelivery] });
    expect(page.rows()).toEqual([]);
    unit12.next({ data: [{ ...activeDelivery, id: 'unit-12' }] });
    harness.detectChanges();

    expect(current).toHaveBeenLastCalledWith({ production_unit_id: 12, per_page: 100 });
    expect(page.rows().map((delivery) => delivery.id)).toEqual(['unit-12']);
  });

  it('preserves older links from customers and notifications', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(listPath + '?reparto=older-origin');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(listPath + '/older-origin');
    expect(detail).toHaveBeenCalledWith('older-origin');
    expect(list).not.toHaveBeenCalled();
  });
});
