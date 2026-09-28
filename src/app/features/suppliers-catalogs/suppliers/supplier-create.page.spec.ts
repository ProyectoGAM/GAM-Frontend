import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { GeographyDepartment, GeographyLocality } from '../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { SuppliersApi } from './suppliers.api';
import { Supplier } from './suppliers.models';
import { SupplierCreatePage } from './supplier-create.page';

const departments: GeographyDepartment[] = [{ id: 12, name: 'Canelones' }];
const localities: GeographyLocality[] = [{ id: 603, department_id: 12, name: 'Pando' }];
const supplier: Supplier = {
  id: 81,
  name: 'Distribuidora Sur',
  address: 'Ruta 8 km 28',
  status: 'active',
  locality: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const createFixture = (create = vi.fn().mockReturnValue(of({ data: supplier }))) => {
  const departmentsRequest = vi.fn().mockReturnValue(of(departments));
  const localitiesRequest = vi.fn().mockReturnValue(of(localities));
  TestBed.configureTestingModule({
    imports: [SupplierCreatePage],
    providers: [
      provideRouter([]),
      { provide: SuppliersApi, useValue: { create } },
      { provide: ProductionUnitsService, useValue: { departments: departmentsRequest, localities: localitiesRequest } },
    ],
  });
  const router = TestBed.inject(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SupplierCreatePage);
  return { fixture, create, departmentsRequest, localitiesRequest, navigateByUrl };
};

describe('Supplier create page', () => {
  it('loads geography through ProductionUnitsService and creates without an invented locality ID', async () => {
    const { fixture, create, departmentsRequest, navigateByUrl } = createFixture();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.form.setValue({ name: '  Distribuidora Sur  ', address: '  Ruta 8 km 28  ' });

    await page.submit();

    expect(departmentsRequest).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({ name: 'Distribuidora Sur', address: 'Ruta 8 km 28' });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('locality_id');
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/proveedores/proveedores', {
      state: { supplierCreated: true },
    });
    expect((fixture.nativeElement as HTMLElement).querySelector('a[routerlink]')?.getAttribute('href'))
      .toBe('/administracion/proveedores/proveedores');
    fixture.destroy();
  });

  it('loads localities for the selected department and submits the selected ID as a number', async () => {
    const { fixture, create, localitiesRequest } = createFixture();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const department = host.querySelector('#supplier-department') as HTMLSelectElement;
    department.value = '12';
    department.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(localitiesRequest).toHaveBeenCalledWith(12);
    const locality = host.querySelector('#supplier-locality') as HTMLSelectElement;
    locality.value = '603';
    locality.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.componentInstance.form.setValue({ name: 'Distribuidora Sur', address: 'Ruta 8 km 28' });
    await fixture.componentInstance.submit();

    expect(fixture.componentInstance.selectedLocalityId()).toBe(603);
    expect(create).toHaveBeenCalledWith({ name: 'Distribuidora Sur', address: 'Ruta 8 km 28', locality_id: 603 });
    fixture.destroy();
  });

  it('shows duplicate-name validation beside Nombre with accessible field association', async () => {
    const create = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { name: ['Ya existe un proveedor con este nombre.'] } },
    })));
    const { fixture } = createFixture(create);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.form.setValue({ name: 'Distribuidora Sur', address: 'Ruta 8 km 28' });

    await page.submit();
    fixture.detectChanges();

    const name = (fixture.nativeElement as HTMLElement).querySelector('#supplier-name') as HTMLInputElement;
    expect(fixture.nativeElement.textContent).toContain('Ya existe un proveedor con este nombre.');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('name-error');
    fixture.destroy();
  });

  it('provides a cancel path back to the supplier list', async () => {
    const { fixture } = createFixture();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('a[routerlink]')?.getAttribute('href'))
      .toBe('/administracion/proveedores/proveedores');
    fixture.destroy();
  });
});
