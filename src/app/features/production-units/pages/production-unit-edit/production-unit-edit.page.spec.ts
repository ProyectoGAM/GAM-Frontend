import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { MAPBOX_ACCESS_TOKEN } from '../../../../core/config/mapbox.config';
import { ProductionUnitGeocodingService } from '../../services/production-unit-geocoding.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { ProductionUnitEditPage } from './production-unit-edit.page';

describe('ProductionUnitEditPage', () => {
  let fixture: ComponentFixture<ProductionUnitEditPage>;
  let getById: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let updateStatus: ReturnType<typeof vi.fn>;
  let resolveLocalityId: ReturnType<typeof vi.fn>;

  const legacyUnit = {
    id: 17,
    name: 'Granja Norte',
    status: 'active' as const,
    address: null,
    latitude: '-34.9',
    longitude: '-56.2',
    locality: {
      id: 8,
      department_id: 3,
      name: 'Las Piedras',
      department: { id: 3, name: 'Canelones' },
    },
  };

  beforeEach(() => {
    getById = vi.fn().mockReturnValue(of({ data: { ...legacyUnit } }));
    update = vi.fn().mockReturnValue(of({ data: { ...legacyUnit } }));
    updateStatus = vi.fn();
    resolveLocalityId = vi.fn().mockReturnValue(of(null));
    TestBed.configureTestingModule({
      imports: [ProductionUnitEditPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '17' }) } } },
        { provide: ProductionUnitsService, useValue: {
          getById,
          departments: vi.fn().mockReturnValue(of([{ id: 3, name: 'Canelones' }])),
          localities: vi.fn().mockReturnValue(of([{ id: 8, department_id: 3, name: 'Las Piedras' }])),
          update,
          updateStatus,
          resolveLocalityId,
        } },
        { provide: ProductionUnitGeocodingService, useValue: { search: vi.fn().mockReturnValue(of([])), reverse: vi.fn().mockReturnValue(of([])) } },
        { provide: MAPBOX_ACCESS_TOKEN, useValue: '' },
      ],
    });
  });

  function render(): ProductionUnitEditPage {
    fixture = TestBed.createComponent(ProductionUnitEditPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('loads and saves a historic point without requiring or inventing an address', () => {
    const page = render();
    expect(page.form.controls.location.value).toEqual({
      address: null,
      latitude: -34.9,
      longitude: -56.2,
      isConfirmed: true,
    });

    page.form.controls.name.setValue('Granja Norte Actualizada');
    page.submit();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(17, {
      name: 'Granja Norte Actualizada',
      locality_id: 8,
      latitude: -34.9,
      longitude: -56.2,
    });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('sends a changed status in the same PATCH as the other edited fields', () => {
    getById.mockReturnValue(of({ data: { ...legacyUnit, address: 'Ruta 8, Las Piedras' } }));
    update.mockReturnValue(of({ data: { ...legacyUnit, address: 'Ruta 8, Las Piedras', status: 'inactive' } }));
    const page = render();
    page.form.controls.name.setValue('Granja Norte Actualizada');
    page.form.controls.status.setValue('inactive');
    page.submit();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(17, {
      name: 'Granja Norte Actualizada',
      locality_id: 8,
      address: 'Ruta 8, Las Piedras',
      latitude: -34.9,
      longitude: -56.2,
      status: 'inactive',
    });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('blocks an unconfirmed changed point and preserves the loaded location', () => {
    const page = render();
    page.onLocationChanged({ address: null, latitude: -34.8, longitude: -56.1, isConfirmed: false });
    page.submit();
    fixture.detectChanges();

    expect(update).not.toHaveBeenCalled();
    expect(page.form.controls.location.value?.latitude).toBe(-34.8);
    expect(fixture.nativeElement.textContent).toContain('Confirmá una dirección');
  });

  it('keeps locality for an unchanged historic point when no saved address exists', () => {
    const page = render();
    page.form.controls.name.setValue('Granja Norte Actualizada');
    page.submit();

    expect(update).toHaveBeenCalledWith(17, expect.objectContaining({ locality_id: 8, latitude: -34.9, longitude: -56.2 }));
    expect(update.mock.calls[0][1]).not.toHaveProperty('address');
  });

  it('allows saving other fields while preserving an unchanged historic numeric point outside Uruguay', () => {
    getById.mockReturnValue(of({ data: { ...legacyUnit, address: null, latitude: '5', longitude: '10' } }));
    const page = render();
    page.form.controls.name.setValue('Granja histórica actualizada');
    page.submit();

    expect(update).toHaveBeenCalledWith(17, expect.objectContaining({
      name: 'Granja histórica actualizada', locality_id: 8, latitude: 5, longitude: 10,
    }));
    expect(update.mock.calls[0][1]).not.toHaveProperty('address');
  });

  it('sends null locality for a new point whose exact catalog lookup is unresolved', () => {
    const page = render();
    page.onLocationChanged({
      address: 'Punto rural, camino vecinal', latitude: -34.8, longitude: -56.1, isConfirmed: true,
      administrativeContext: { locality: 'Lugar inexistente', department: 'Durazno' },
    });
    page.form.controls.name.setValue('Granja Norte Actualizada');
    page.submit();

    expect(resolveLocalityId).toHaveBeenCalledWith({ locality: 'Lugar inexistente', department: 'Durazno' });
    expect(update).toHaveBeenCalledWith(17, expect.objectContaining({ locality_id: null, latitude: -34.8, longitude: -56.1 }));
  });
});
