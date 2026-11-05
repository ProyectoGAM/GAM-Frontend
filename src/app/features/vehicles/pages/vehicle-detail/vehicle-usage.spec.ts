import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { Vehicle, VehicleDetail, VehicleReading, VehicleUsage } from '../../interfaces/vehicle';
import { VehiclesApi } from '../../services/vehicles.api';
import { VehicleDetailPage } from './vehicle-detail.page';

describe('Uso y lecturas', () => {
  const vehicle: Vehicle = {
    id: 'vehicle-1', plate: 'SAB 1234', make: 'Toyota', model: 'Hilux', year: 2021,
    admitted_at: null, capacity_kg: null, status: 'active', status_reason: null,
    habitual_driver: null, notes: null, version: 1, availability: 'in_use',
    availability_reason: null, maintenance_warnings: [], latest_odometer: '84520', latest_odometer_at: null,
  };
  const usage: VehicleUsage = {
    id: 'use-1', purpose: 'Traslado al taller', driver_snapshot: 'Martín Silva', started_at: '2026-11-05T12:15:00Z',
    ended_at: null, start_odometer_km: '84500', end_odometer_km: null, vehicle_snapshot: vehicle, delivery_id: null,
  };
  const reading: VehicleReading = {
    id: 'reading-1', meter_type: 'odometer', event_type: 'reading', event_reason: null, corrects_reading_id: null,
    value: '84520.0', recorded_at: '2026-11-05T13:10:47Z', received_at: '2026-11-05T13:11:00Z',
    source: 'manual', notes: null, correction_reason: null,
  };
  let restoreDialog: () => void;

  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => { restoreDialog(); });

  async function setup(recordedUsages: VehicleUsage[]) {
    const detail: VehicleDetail = {
      data: vehicle, usages: recordedUsages, readings: [reading], status_changes: [], fuel_entries: [],
      maintenance_plans: [], maintenances: [], documents: [], availability: { availability: 'in_use', reason: null, warnings: [] },
    };
    const recordReading = vi.fn().mockReturnValue(of({ data: {} }));
    const closeUsage = vi.fn().mockReturnValue(of({ data: {} }));
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: vehicle.id }) } } },
      { provide: AuthStore, useValue: { user: signal({ roles: ['admin'], name: 'Administrador' }) } },
      { provide: VehiclesApi, useValue: { detail: () => of(detail), drivers: () => of({ data: [] }), reading: recordReading, closeUsage } },
    ] });
    const fixture = TestBed.createComponent(VehicleDetailPage);
    fixture.componentInstance.tab.set('usage');
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;
    const click = (selector: string) => page.querySelector<HTMLButtonElement>(selector)!.click();
    return { fixture, page, click, recordReading, closeUsage };
  }

  it('shows a delivery as active without offering a separate closure', async () => {
    const { page } = await setup([{ ...usage, purpose: 'delivery', delivery_id: 'delivery-1' }]);
    const current = page.querySelector('.usage-current');
    expect(current?.textContent).toContain('Reparto');
    expect(current?.textContent).toContain('84.500 km');
    expect(current?.querySelector('button')).toBeNull();
    expect(page.querySelector('.usage-history-row')).toBeNull();
  });

  it('opens and cancels an external usage closure without sending it', async () => {
    const { fixture, page, click, closeUsage } = await setup([usage]);
    click('.usage-current button');
    await fixture.whenStable();
    const dialog = page.querySelector<HTMLDialogElement>('dialog[open]');
    expect(dialog?.textContent).toContain('Kilometraje de cierre');
    dialog?.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog?.open).toBe(false);
    expect(closeUsage).not.toHaveBeenCalled();
  });

  it('keeps the correction open on failure and retries the exact original date with the same key', async () => {
    const { fixture, page, click, recordReading } = await setup([usage]);
    recordReading.mockReturnValueOnce(throwError(() => new Error('Network')));
    click('.usage-text-action');
    await fixture.whenStable();
    const dialog = page.querySelector<HTMLDialogElement>('dialog[open]');
    expect(dialog?.querySelector('h2')?.textContent?.trim()).toBe('Rectificar lectura');
    fixture.componentInstance.readingForm.patchValue({ value: '84521,2', event_reason: 'Lectura mal digitada' });
    click('dialog[open] button[type="submit"]');
    await fixture.whenStable();
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector('[role="alert"]')?.textContent).toContain('No se pudo guardar');
    expect(recordReading).toHaveBeenNthCalledWith(1, vehicle.id, expect.objectContaining({
      value: '84521.2', corrects_reading_id: reading.id, recorded_at: reading.recorded_at,
    }), expect.any(String));
    click('dialog[open] button[type="submit"]');
    await fixture.whenStable();
    expect(recordReading.mock.calls[1]).toEqual(recordReading.mock.calls[0]);
    expect(dialog?.open).toBe(false);
  });
});
