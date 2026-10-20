import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { EggPresentationsApi } from '../../services/egg-presentations.api';
import { EggPresentationsPage } from './egg-presentations.page';

const presentation = { id: 'maple', label: 'Maple', category: 'maples', eggs_per_unit: 30, default_unit_price: 101, currency: 'UYU' as const };

describe('EggPresentationsPage', () => {
  const api = { list: vi.fn(), create: vi.fn(), update: vi.fn() };
  let page: EggPresentationsPage;

  beforeEach(async () => {
    vi.clearAllMocks();
    api.list.mockReturnValue(of({ data: [presentation], meta: { locked: false } }));
    api.create.mockReturnValue(of({ data: presentation }));
    api.update.mockReturnValue(of({ data: presentation }));
    TestBed.configureTestingModule({ providers: [{ provide: EggPresentationsApi, useValue: api }] });
    page = TestBed.runInInjectionContext(() => new EggPresentationsPage());
    await page.load();
  });

  it('creates a unit and allows editing its quantity and default integer price', async () => {
    page.form.setValue({ name: 'Cajón', eggs_per_unit: 360, default_unit_price: 101 });
    await page.save();
    expect(api.create).toHaveBeenCalledWith({ name: 'Cajón', eggs_per_unit: 360, default_unit_price: 101 });
    page.edit(presentation);
    page.form.controls.default_unit_price.setValue(90);
    await page.save();
    expect(api.update).toHaveBeenCalledWith('maple', { name: 'Maple', eggs_per_unit: 30, default_unit_price: 90 });
  });

  it('disables the whole form and prevents all writes while deliveries are active', async () => {
    api.list.mockReturnValue(of({ data: [presentation], meta: { locked: true } }));
    await page.load();
    expect(page.form.disabled).toBe(true);
    page.edit(presentation);
    await page.save();
    expect(page.editing()).toBeNull();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('rejects fractional prices and reports a server-side lock without claiming success', async () => {
    page.form.setValue({ name: 'Cajón', eggs_per_unit: 360, default_unit_price: 100.01 });
    await page.save();
    expect(api.create).not.toHaveBeenCalled();
    page.form.controls.default_unit_price.setValue(100);
    api.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Catálogo bloqueado' } })));
    await page.save();
    expect(page.error()).toBe('Catálogo bloqueado');
    expect(page.message()).toBeNull();
  });
});
