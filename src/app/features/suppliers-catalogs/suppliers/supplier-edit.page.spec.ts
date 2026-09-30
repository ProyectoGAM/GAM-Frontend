import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { GeographyDepartment, GeographyLocality } from '../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { Supplier } from './suppliers.models';
import { SuppliersApi } from './suppliers.api';
import { SupplierEditPage } from './supplier-edit.page';

const department: GeographyDepartment = { id: 12, name: 'Canelones' };
const locality: GeographyLocality = { id: 603, department_id: 12, name: 'Pando' };
const supplierWithLocality: Supplier = {
  id: 81,
  name: 'Distribuidora Sur',
  address: 'Ruta 8 km 28',
  status: 'active',
  locality: { id: 603, name: 'Pando', department: { id: 12, name: 'Canelones' } },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const supplierWithoutLocality: Supplier = { ...supplierWithLocality, locality: null };

const createFixture = (
  supplier = supplierWithLocality,
  updateSupplier = vi.fn().mockReturnValue(of({ data: supplier })),
  localitiesRequest = vi.fn().mockReturnValue(of([locality])),
  departmentsRequest = vi.fn().mockReturnValue(of([department])),
) => {
  TestBed.configureTestingModule({
    imports: [SupplierEditPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: String(supplier.id) }) } } },
      { provide: Location, useValue: { getState: () => ({ supplier }) } },
      { provide: SuppliersApi, useValue: { updateSupplier } },
      { provide: ProductionUnitsService, useValue: { departments: departmentsRequest, localities: localitiesRequest } },
    ],
  });
  const router = TestBed.inject(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SupplierEditPage);
  return { fixture, updateSupplier, departmentsRequest, localitiesRequest, navigateByUrl };
};

describe('Supplier edit page', () => {
  it('prefills fields and loads the supplier department and locality through ProductionUnitsService', async () => {
    const { fixture, localitiesRequest } = createFixture();
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.componentInstance;
    expect(page.form.getRawValue()).toEqual({ name: 'Distribuidora Sur', address: 'Ruta 8 km 28' });
    expect(page.selectedDepartmentId()).toBe(12);
    expect(page.selectedLocalityId()).toBe(603);
    expect(localitiesRequest).toHaveBeenCalledWith(12);
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#supplier-department')?.value).toBe('12');
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#supplier-locality')?.value).toBe('603');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Editar proveedor');
    fixture.destroy();
  });

  it('keeps both geography selections empty and sends locality_id null when the supplier has no locality', async () => {
    const { fixture, updateSupplier, navigateByUrl } = createFixture(supplierWithoutLocality);
    await fixture.whenStable();
    const page = fixture.componentInstance;

    expect(page.selectedDepartmentId()).toBeNull();
    expect(page.selectedLocalityId()).toBeNull();
    page.form.setValue({ name: '  Distribuidora nueva  ', address: '  Ruta 10  ' });
    await page.submit();

    expect(updateSupplier).toHaveBeenCalledOnce();
    expect(updateSupplier).toHaveBeenCalledWith(81, {
      name: 'Distribuidora nueva',
      address: 'Ruta 10',
      locality_id: null,
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/proveedores/proveedores', {
      state: { supplierUpdated: true },
    });
    fixture.destroy();
  });

  it('loads selected-department localities and submits the selected locality as a number', async () => {
    const { fixture, updateSupplier, localitiesRequest } = createFixture(supplierWithoutLocality);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.onDepartmentChanged('12');
    await fixture.whenStable();
    page.onLocalityChanged('603');
    page.form.setValue({ name: 'Distribuidora nueva', address: 'Ruta 10' });
    await page.submit();

    expect(localitiesRequest).toHaveBeenCalledWith(12);
    expect(page.selectedLocalityId()).toBe(603);
    expect(updateSupplier).toHaveBeenCalledWith(81, {
      name: 'Distribuidora nueva', address: 'Ruta 10', locality_id: 603,
    });
    fixture.destroy();
  });

  it('preserves the existing locality ID when geography requests fail', async () => {
    const updateSupplier = vi.fn().mockReturnValue(of({ data: supplierWithLocality }));
    const localitiesRequest = vi.fn().mockReturnValue(throwError(() => new Error('offline')));
    const departmentsRequest = vi.fn().mockReturnValue(throwError(() => new Error('offline')));
    const { fixture } = createFixture(
      supplierWithLocality,
      updateSupplier,
      localitiesRequest,
      departmentsRequest,
    );
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.form.setValue({ name: 'Nombre editado', address: 'Dirección editada' });
    await page.submit();

    expect(page.departmentsState()).toBe('error');
    expect(page.localitiesState()).toBe('error');
    expect(page.selectedDepartmentId()).toBe(12);
    expect(page.selectedLocalityId()).toBe(603);
    expect(updateSupplier).toHaveBeenCalledWith(81, {
      name: 'Nombre editado', address: 'Dirección editada', locality_id: 603,
    });
    fixture.destroy();
  });

  it('shows duplicate-name validation beside Nombre and lets the user correct it', async () => {
    const updateSupplier = vi.fn().mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { name: ['Ya existe un proveedor con este nombre.'] } },
    }))).mockReturnValueOnce(of({ data: supplierWithLocality }));
    const { fixture, navigateByUrl } = createFixture(supplierWithLocality, updateSupplier);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.form.setValue({ name: 'Distribuidora repetida', address: 'Ruta 8 km 28' });

    await page.submit();
    fixture.detectChanges();
    const name = (fixture.nativeElement as HTMLElement).querySelector('#supplier-name') as HTMLInputElement;
    expect(fixture.nativeElement.textContent).toContain('Ya existe un proveedor con este nombre.');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('name-error');

    name.value = 'Distribuidora corregida';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    page.form.controls.name.setValue('Distribuidora corregida');
    await page.submit();
    expect(navigateByUrl).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('cancel returns to the list without sending a PATCH', async () => {
    const { fixture, updateSupplier } = createFixture();
    await fixture.whenStable();
    fixture.detectChanges();

    const cancel = (fixture.nativeElement as HTMLElement).querySelector('a[routerlink]') as HTMLAnchorElement;
    expect(cancel.getAttribute('href')).toBe('/administracion/proveedores/proveedores');
    cancel.click();
    expect(updateSupplier).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('keeps API failures visible and allows a successful retry', async () => {
    const updateSupplier = vi.fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
      .mockReturnValueOnce(of({ data: supplierWithLocality }));
    const { fixture, navigateByUrl } = createFixture(supplierWithLocality, updateSupplier);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.form.setValue({ name: 'Distribuidora Sur', address: 'Ruta 8 km 28' });

    await page.submit();
    fixture.detectChanges();
    expect(page.error()).toBe('No se pudo actualizar el proveedor. Intentá nuevamente.');
    expect(fixture.nativeElement.textContent).toContain('No se pudo actualizar el proveedor. Intentá nuevamente.');
    await page.submit();

    expect(updateSupplier).toHaveBeenCalledTimes(2);
    expect(navigateByUrl).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});
