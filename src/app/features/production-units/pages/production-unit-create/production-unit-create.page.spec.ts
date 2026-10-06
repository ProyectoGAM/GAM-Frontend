import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { MAPBOX_ACCESS_TOKEN } from '../../../../core/config/mapbox.config';
import { ProductionUnitLocationValue } from '../../interfaces/production-unit.interface';
import { ProductionUnitGeocodingService } from '../../services/production-unit-geocoding.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { ProductionUnitCreatePage } from './production-unit-create.page';

describe('ProductionUnitCreatePage', () => {
  let fixture: ComponentFixture<ProductionUnitCreatePage>;
  let create: ReturnType<typeof vi.fn>;
  let resolveLocalityId: ReturnType<typeof vi.fn>;
  const confirmedLocation: ProductionUnitLocationValue = {
    address: 'Ruta 8, Las Piedras', latitude: -34.9, longitude: -56.2, isConfirmed: true,
    administrativeContext: { locality: 'Las Piedras', department: 'Canelones' },
  };

  beforeEach(() => {
    create = vi.fn().mockReturnValue(of({ data: { id: 42, name: 'Granja Norte' } }));
    resolveLocalityId = vi.fn().mockReturnValue(of(8));
    TestBed.configureTestingModule({
      imports: [ProductionUnitCreatePage],
      providers: [
        provideRouter([]),
        { provide: ProductionUnitsService, useValue: { create, resolveLocalityId, validateLocation: vi.fn().mockReturnValue(of(undefined)) } },
        { provide: ProductionUnitGeocodingService, useValue: { search: vi.fn().mockReturnValue(of([])), reverse: vi.fn().mockReturnValue(of([])) } },
        { provide: MAPBOX_ACCESS_TOKEN, useValue: '' },
      ],
    });
  });

  function render(): ProductionUnitCreatePage {
    fixture = TestBed.createComponent(ProductionUnitCreatePage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('creates with numeric coordinates, a resolved catalog locality, and status in the same request', () => {
    const page = render();
    page.form.controls.name.setValue('  Granja Norte  ');
    page.onLocationChanged(confirmedLocation);
    page.form.controls.status.setValue('inactive');
    fixture.detectChanges();
    page.submit();
    fixture.detectChanges();

    expect(resolveLocalityId).toHaveBeenCalledWith(confirmedLocation.administrativeContext);
    expect(create).toHaveBeenCalledWith({
      locality_id: 8,
      name: 'Granja Norte',
      address: 'Ruta 8, Las Piedras',
      latitude: -34.9,
      longitude: -56.2,
      status: 'inactive',
    });
    expect(fixture.nativeElement.textContent).toContain('Granja Norte');
  });

  it('sends null locality when exact Mapbox context cannot resolve in the catalogs', () => {
    resolveLocalityId.mockReturnValue(of(null));
    const page = render();
    page.form.controls.name.setValue('Granja rural');
    page.onLocationChanged({ ...confirmedLocation, administrativeContext: null });
    page.submit();

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ locality_id: null }));
  });

  it('requires a confirmed valid location and prevents saving while map validation is pending', () => {
    const page = render();
    page.form.controls.name.setValue('Granja Norte');
    page.onLocationChanged({ address: null, latitude: Number.POSITIVE_INFINITY, longitude: 181, isConfirmed: false });
    page.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Elegí un punto en el mapa');
    page.onLocationChanged(confirmedLocation);
    page.locationSelectionPending.set(true);
    page.submit();

    expect(create).not.toHaveBeenCalled();
  });

  it('removes manual locality selectors and coordinate fields from the form', () => {
    const page = render();
    page.form.controls.name.setValue('Granja Norte');
    page.onLocationChanged(confirmedLocation);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Departamento');
    expect(fixture.nativeElement.textContent).not.toContain('Localidad');
    expect(fixture.nativeElement.textContent).not.toContain('Latitud');
    expect(fixture.nativeElement.textContent).not.toContain('Longitud');
    expect(fixture.nativeElement.querySelector('ion-select[formControlName="departmentId"]')).toBeNull();
  });

  it('maps backend location validation failures to the picker error', () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { address: ['Completá una dirección válida.'] } },
    })));
    const page = render();
    page.form.controls.name.setValue('Granja Norte');
    page.onLocationChanged(confirmedLocation);
    page.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Completá una dirección válida.');
  });
});
