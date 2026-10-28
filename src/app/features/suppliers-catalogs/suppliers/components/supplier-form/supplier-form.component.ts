import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { GeographyDepartment, GeographyLocality } from '../../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../../production-units/services/production-units.service';
import { StoreSupplierRequest, SupplierEditSeed } from '../../suppliers.models';
import { SuppliersApi } from '../../suppliers.api';

type GeoState = 'loading' | 'success' | 'empty' | 'error';
type LocalitiesState = 'idle' | GeoState;

@Component({
  selector: 'app-supplier-form',
  templateUrl: './supplier-form.component.html',
  styleUrl: './supplier-form.component.scss',
  imports: [ReactiveFormsModule],
})
export class SupplierFormComponent implements OnInit {
  private readonly api = inject(SuppliersApi);
  private readonly geography = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
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

  readonly supplier = input<SupplierEditSeed | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();
  readonly busyChanged = output<boolean>();

  ngOnInit(): void {
    const supplier = this.supplier();
    if (supplier) {
      this.form.setValue({ name: supplier.name, address: supplier.address });
      this.selectedDepartmentId.set(supplier.locality?.department.id ?? null);
      this.selectedLocalityId.set(supplier.locality?.id ?? null);
      if (supplier.locality) void this.loadLocalities(supplier.locality.department.id, ++this.localityRequestId);
    }
    void this.loadDepartments();
  }

  async loadDepartments(): Promise<void> {
    this.departmentsState.set('loading');
    try {
      const departments = await firstValueFrom(this.geography.departments().pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyRef.destroyed) return;
      this.departments.set(departments);
      this.departmentsState.set(departments.length ? 'success' : 'empty');
    } catch {
      if (!this.destroyRef.destroyed) this.departmentsState.set('error');
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
    this.setSaving(true);
    const supplier = this.supplier();
    const value = this.form.getRawValue();
    const localityId = this.selectedLocalityId();
    const body: StoreSupplierRequest = {
      name: value.name.trim(),
      address: value.address.trim(),
      ...(localityId !== null ? { locality_id: localityId } : {}),
    };

    try {
      const request = supplier
        ? this.api.updateSupplier(supplier.id, { ...body, locality_id: localityId })
        : this.api.create(body);
      await firstValueFrom(request.pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyRef.destroyed) return;
      this.setSaving(false);
      this.saved.emit();
    } catch (error) {
      if (this.destroyRef.destroyed) return;
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.applyValidationErrors(error);
        this.error.set('Revisa los datos ingresados.');
      } else {
        this.error.set(supplier ? 'No se pudo actualizar el proveedor. Intentá nuevamente.' : 'No se pudo guardar el proveedor. Intentá nuevamente.');
      }
    } finally {
      if (!this.destroyRef.destroyed) this.setSaving(false);
    }
  }

  cancel(): void {
    if (!this.saving()) this.cancelled.emit();
  }

  private setSaving(busy: boolean): void {
    if (this.saving() === busy) return;
    this.saving.set(busy);
    this.busyChanged.emit(busy);
  }

  private async loadLocalities(departmentId: number, requestId: number): Promise<void> {
    this.localitiesState.set('loading');
    try {
      const localities = await firstValueFrom(this.geography.localities(departmentId).pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyRef.destroyed || requestId !== this.localityRequestId) return;
      this.localities.set(localities);
      this.localitiesState.set(localities.length ? 'success' : 'empty');
    } catch {
      if (this.destroyRef.destroyed || requestId !== this.localityRequestId) return;
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
