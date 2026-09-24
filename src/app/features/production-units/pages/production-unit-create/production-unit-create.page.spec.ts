import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ProductionUnitsService } from '../../services/production-units.service';
import { ProductionUnitCreatePage } from './production-unit-create.page';

describe('ProductionUnitCreatePage', () => {
  let fixture: ComponentFixture<ProductionUnitCreatePage>;
  let departments: ReturnType<typeof vi.fn>;
  let localities: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    departments = vi.fn().mockReturnValue(of([{ id: 3, name: 'Canelones' }]));
    localities = vi.fn().mockReturnValue(of([{ id: 8, department_id: 3, name: 'Las Piedras' }]));
    create = vi.fn().mockReturnValue(of({ data: { id: 42, name: 'Granja Norte' } }));
    TestBed.configureTestingModule({
      imports: [ProductionUnitCreatePage],
      providers: [
        provideRouter([]),
        { provide: ProductionUnitsService, useValue: { departments, localities, create } },
      ],
    });
  });

  function render(): void {
    fixture = TestBed.createComponent(ProductionUnitCreatePage);
    fixture.detectChanges();
  }

  it('submits the selected locality, numeric coordinates and active default, then confirms creation', () => {
    render();
    const page = fixture.componentInstance;
    page.form.controls.name.setValue('  Granja Norte  ');
    page.onDepartmentChanged(3);
    page.form.controls.localityId.setValue(8);
    page.form.controls.latitude.setValue(-34.9);
    page.form.controls.longitude.setValue(-56.2);
    fixture.detectChanges();

    expect(page.form.controls.status.value).toBe('active');
    page.submit();
    fixture.detectChanges();

    expect(create).toHaveBeenCalledWith({
      locality_id: 8,
      name: 'Granja Norte',
      latitude: -34.9,
      longitude: -56.2,
      status: 'active',
    });
    expect(fixture.nativeElement.textContent).toContain('“Granja Norte” se creó correctamente.');
    expect(fixture.nativeElement.textContent).toContain('Volver al listado');
  });

  it('shows the missing geography permission state when departments return 403', () => {
    departments.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));

    render();

    expect(fixture.nativeElement.textContent).toContain('Acceso no disponible');
    expect(fixture.nativeElement.textContent).toContain('permiso para consultar departamentos y localidades');
  });

  it('shows the missing create permission state when the API rejects creation', () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    render();
    const page = fixture.componentInstance;
    page.form.controls.name.setValue('Granja Norte');
    page.onDepartmentChanged(3);
    page.form.controls.localityId.setValue(8);
    page.form.controls.latitude.setValue(-34.9);
    page.form.controls.longitude.setValue(-56.2);

    page.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No tienes permiso para crear unidades productivas.');
  });

  it('maps backend validation errors to the matching form field', () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { name: ['El nombre ya está registrado en esta localidad.'] } },
    })));
    render();
    const page = fixture.componentInstance;
    page.form.controls.name.setValue('Granja Norte');
    page.onDepartmentChanged(3);
    page.form.controls.localityId.setValue(8);
    page.form.controls.latitude.setValue(-34.9);
    page.form.controls.longitude.setValue(-56.2);
    page.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('El nombre ya está registrado en esta localidad.');
    expect(fixture.nativeElement.textContent).toContain('Revisá los campos señalados');
  });

  it('does not submit a name made only of spaces', () => {
    render();
    const page = fixture.componentInstance;
    page.form.controls.name.setValue('   ');
    page.submit();
    fixture.detectChanges();

    expect(create).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('El nombre no puede contener solo espacios.');
  });

  it('ignores locality results from a department that is no longer selected', () => {
    const previousDepartment = new Subject<Array<{ id: number; department_id: number; name: string }>>();
    const selectedDepartment = new Subject<Array<{ id: number; department_id: number; name: string }>>();
    localities.mockReturnValueOnce(previousDepartment).mockReturnValueOnce(selectedDepartment);
    render();
    const page = fixture.componentInstance;

    page.onDepartmentChanged(3);
    page.onDepartmentChanged(4);
    selectedDepartment.next([{ id: 41, department_id: 4, name: 'Actual' }]);
    previousDepartment.next([{ id: 31, department_id: 3, name: 'Anterior' }]);

    expect(page.localities()).toEqual([{ id: 41, department_id: 4, name: 'Actual' }]);
  });

  it('keeps locality selection disabled while loading and enables it after options arrive', () => {
    const pendingLocalities = new Subject<Array<{ id: number; department_id: number; name: string }>>();
    localities.mockReturnValue(pendingLocalities);
    render();
    const page = fixture.componentInstance;

    expect(page.form.controls.localityId.disabled).toBe(true);
    page.onDepartmentChanged(3);
    expect(page.form.controls.localityId.disabled).toBe(true);

    pendingLocalities.next([{ id: 8, department_id: 3, name: 'Las Piedras' }]);
    fixture.detectChanges();

    expect(page.form.controls.localityId.enabled).toBe(true);
    expect(fixture.nativeElement.querySelector('ion-select[formControlName="localityId"]').hasAttribute('disabled')).toBe(false);
  });

  it('ignores repeated submits while the create request is pending', () => {
    const pendingCreate = new Subject<{ data: { id: number; name: string } }>();
    create.mockReturnValue(pendingCreate);
    render();
    const page = fixture.componentInstance;
    page.form.controls.name.setValue('Granja Norte');
    page.onDepartmentChanged(3);
    page.form.controls.localityId.setValue(8);
    page.form.controls.latitude.setValue(-34.9);
    page.form.controls.longitude.setValue(-56.2);

    page.submit();
    page.submit();
    fixture.detectChanges();

    expect(create).toHaveBeenCalledTimes(1);
    expect(page.isSubmitting()).toBe(true);
    expect(fixture.nativeElement.querySelector('.submit-button').textContent).toContain('Creando…');

    pendingCreate.next({ data: { id: 42, name: 'Granja Norte' } });
    pendingCreate.complete();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('se creó correctamente');
  });
});
