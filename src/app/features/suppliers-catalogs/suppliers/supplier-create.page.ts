import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { GeographyDepartment, GeographyLocality } from '../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { StoreSupplierRequest } from './suppliers.models';
import { SuppliersApi } from './suppliers.api';

const SUPPLIERS_PATH = '/administracion/proveedores/proveedores';

type GeoState = 'loading' | 'success' | 'empty' | 'error';
type LocalitiesState = 'idle' | GeoState;

@Component({
  selector: 'app-supplier-create',
  templateUrl: './supplier-create.page.html',
  styleUrl: './supplier-create.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class SupplierCreatePage {
  private readonly api = inject(SuppliersApi);
  private readonly geography = inject(ProductionUnitsService);
  private readonly router = inject(Router);
  private localityRequestId = 0;

  readonly departments = signal<GeographyDepartment[]>([]);
  readonly localities = signal<GeographyLocality[]>([]);
  readonly departmentsState = signal<GeoState>('loading');
  readonly localitiesState = signal<LocalitiesState>('idle');
  readonly selectedDepartmentId = signal<number | null>(null);
  readonly selectedLocalityId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly localityError = signal<string | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(160)] }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)] }),
  });

  constructor() {
    void this.loadDepartments();
  }

  async loadDepartments(): Promise<void> {
    this.departmentsState.set('loading');
    try {
      const departments = await firstValueFrom(this.geography.departments());
      this.departments.set(departments);
      this.departmentsState.set(departments.length ? 'success' : 'empty');
    } catch {
      this.departmentsState.set('error');
    }
  }

  onDepartmentChanged(value: string): void {
    const departmentId = value ? Number(value) : null;
    this.selectedDepartmentId.set(
      departmentId !== null && Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null,
    );
    this.selectedLocalityId.set(null);
    this.localityError.set(null);
    this.localities.set([]);
    this.localityRequestId += 1;

    const selectedId = this.selectedDepartmentId();
    if (selectedId === null) {
      this.localitiesState.set('idle');
      return;
    }
    void this.loadLocalities(selectedId, this.localityRequestId);
  }

  onLocalityChanged(value: string): void {
    const localityId = value ? Number(value) : null;
    this.selectedLocalityId.set(
      localityId !== null && Number.isInteger(localityId)
        && this.localities().some((locality) => locality.id === localityId)
        ? localityId
        : null,
    );
    this.localityError.set(null);
  }

  retryLocalities(): void {
    const departmentId = this.selectedDepartmentId();
    if (departmentId === null) return;
    this.localityRequestId += 1;
    this.selectedLocalityId.set(null);
    void this.loadLocalities(departmentId, this.localityRequestId);
  }

  clearFieldError(control: AbstractControl): void {
    this.error.set(null);
    if (!control.hasError('server')) return;
    const errors = { ...(control.errors ?? {}) };
    delete errors['server'];
    control.setErrors(Object.keys(errors).length ? errors : null);
  }

  fieldError(control: AbstractControl): string | null {
    const serverError = control.getError('server');
    if (typeof serverError === 'string') return serverError;
    if (control.touched && control.hasError('required')) return 'Completa este campo.';
    if (control.touched && control.hasError('pattern')) return 'Ingresa un valor que no esté vacío.';
    if (control.touched && control.hasError('maxlength')) return 'El valor supera el máximo permitido.';
    return null;
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.saving.set(true);
    const value = this.form.getRawValue();
    const localityId = this.selectedLocalityId();
    const body: StoreSupplierRequest = {
      name: value.name.trim(),
      address: value.address.trim(),
      ...(localityId !== null ? { locality_id: localityId } : {}),
    };

    try {
      await firstValueFrom(this.api.create(body));
      await this.router.navigateByUrl(SUPPLIERS_PATH, { state: { supplierCreated: true } });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.applyValidationErrors(error);
        this.error.set('Revisa los datos ingresados.');
      } else {
        this.error.set('No se pudo guardar el proveedor. Intentá nuevamente.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async loadLocalities(departmentId: number, requestId: number): Promise<void> {
    this.localitiesState.set('loading');
    try {
      const localities = await firstValueFrom(this.geography.localities(departmentId));
      if (requestId !== this.localityRequestId) return;
      this.localities.set(localities);
      this.localitiesState.set(localities.length ? 'success' : 'empty');
    } catch {
      if (requestId !== this.localityRequestId) return;
      this.localitiesState.set('error');
    }
  }

  private applyValidationErrors(error: HttpErrorResponse): void {
    const body = typeof error.error === 'object' && error.error !== null
      ? error.error as { errors?: Record<string, unknown> }
      : {};
    for (const [field, errors] of Object.entries(body.errors ?? {})) {
      const message = Array.isArray(errors)
        ? errors.filter((item): item is string => typeof item === 'string').join(' ')
        : '';
      if (!message) continue;
      if (field === 'name' || field === 'address') {
        const control = this.form.controls[field];
        control.setErrors({ ...(control.errors ?? {}), server: message });
      } else if (field === 'locality_id') {
        this.localityError.set(message);
      }
    }
  }
}
