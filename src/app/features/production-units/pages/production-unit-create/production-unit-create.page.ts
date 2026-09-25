import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
} from '@ionic/angular';

import { GeographyDepartment, GeographyLocality } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';

type LoadState = 'loading' | 'success' | 'empty' | 'offline' | 'forbidden' | 'error';
type LocalitiesState = 'idle' | LoadState;
type ErrorField = 'name' | 'localityId' | 'latitude' | 'longitude' | 'status';
type FormErrors = Partial<Record<ErrorField, string>>;

@Component({
  selector: 'app-production-unit-create-page',
  templateUrl: './production-unit-create.page.html',
  styleUrl: './production-unit-create.page.scss',
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonText,
    ReactiveFormsModule,
    RouterLink,
  ],
})
export class ProductionUnitCreatePage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  private localityRequestId = 0;

  readonly departments = signal<GeographyDepartment[]>([]);
  readonly localities = signal<GeographyLocality[]>([]);
  readonly departmentsState = signal<LoadState>('loading');
  readonly localitiesState = signal<LocalitiesState>('idle');
  readonly selectedDepartmentId = signal<number | null>(null);
  readonly accessDenied = signal<'geography' | 'manage' | null>(null);
  readonly isSubmitting = signal(false);
  readonly hasAttemptedSubmit = signal(false);
  readonly formErrors = signal<FormErrors>({});
  readonly submitError = signal<string | null>(null);
  readonly createdUnitName = signal<string | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)] }),
    departmentId: new FormControl<number | null>(null, Validators.required),
    localityId: new FormControl<number | null>({ value: null, disabled: true }, Validators.required),
    latitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-180), Validators.max(180)]),
    status: new FormControl<'active' | 'inactive'>('active', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    addIcons({ 'information-circle-outline': informationCircleOutline });
  }

  ngOnInit(): void {
    this.loadDepartments();
  }

  loadDepartments(): void {
    this.departmentsState.set('loading');
    this.service.departments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (departments) => {
        this.departments.set(departments);
        this.departmentsState.set(departments.length ? 'success' : 'empty');
      },
      error: (error: unknown) => {
        const state = this.loadErrorState(error);
        this.departmentsState.set(state);
        if (state === 'forbidden') this.accessDenied.set('geography');
      },
    });
  }

  onDepartmentChanged(value: number | string | null | undefined): void {
    const departmentId = value === null || value === undefined || value === '' ? null : Number(value);
    this.selectedDepartmentId.set(departmentId);
    this.form.controls.departmentId.setValue(departmentId);
    this.form.controls.localityId.reset(null);
    this.form.controls.localityId.disable();
    this.clearFieldError('localityId');
    this.localities.set([]);
    this.localityRequestId += 1;

    if (departmentId === null || !Number.isInteger(departmentId)) {
      this.localitiesState.set('idle');
      return;
    }

    this.loadLocalities(departmentId, this.localityRequestId);
  }

  retryLocalities(): void {
    const departmentId = this.selectedDepartmentId();
    if (departmentId !== null) {
      this.localityRequestId += 1;
      this.form.controls.localityId.reset(null);
      this.form.controls.localityId.disable();
      this.loadLocalities(departmentId, this.localityRequestId);
    }
  }

  clearFieldError(field: ErrorField): void {
    this.submitError.set(null);
    this.formErrors.update((errors) => {
      const next = { ...errors };
      delete next[field];
      return next;
    });
  }

  submit(): void {
    if (this.isSubmitting()) return;
    this.hasAttemptedSubmit.set(true);
    this.submitError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    if (value.departmentId === null || value.localityId === null || value.latitude === null || value.longitude === null) {
      this.form.markAllAsTouched();
      return;
    }

    this.formErrors.set({});
    this.isSubmitting.set(true);
    this.service.create({
      locality_id: value.localityId,
      name: value.name.trim(),
      latitude: Number(value.latitude),
      longitude: Number(value.longitude),
      status: value.status,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        this.createdUnitName.set(response.data.name);
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.handleCreateError(error);
      },
    });
  }

  private loadLocalities(departmentId: number, requestId: number): void {
    this.localitiesState.set('loading');
    this.service.localities(departmentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (localities) => {
        if (requestId !== this.localityRequestId) return;
        this.localities.set(localities);
        this.localitiesState.set(localities.length ? 'success' : 'empty');
        if (localities.length > 0) this.form.controls.localityId.enable();
      },
      error: (error: unknown) => {
        if (requestId !== this.localityRequestId) return;
        const state = this.loadErrorState(error);
        this.localitiesState.set(state);
        if (state === 'forbidden') this.accessDenied.set('geography');
      },
    });
  }

  private loadErrorState(error: unknown): LoadState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403 || error.status === 401) return 'forbidden';
      if (error.status === 0) return 'offline';
    }
    return 'error';
  }

  private handleCreateError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.submitError.set('No se pudo crear la unidad productiva. Intentá nuevamente.');
      return;
    }

    if (error.status === 403 || error.status === 401) {
      this.accessDenied.set('manage');
      return;
    }

    if (error.status === 0) {
      this.submitError.set('Sin conexión. Revisá tu conexión e intentá nuevamente.');
      return;
    }

    if (error.status === 422) {
      this.formErrors.set(this.mapValidationErrors(error.error));
      this.submitError.set('Revisá los campos señalados e intentá nuevamente.');
      return;
    }

    this.submitError.set('No se pudo crear la unidad productiva. Intentá nuevamente.');
  }

  private mapValidationErrors(body: unknown): FormErrors {
    if (typeof body !== 'object' || body === null || !('errors' in body)) return {};
    const rawErrors = body.errors;
    if (typeof rawErrors !== 'object' || rawErrors === null || Array.isArray(rawErrors)) return {};

    const fields: Record<string, ErrorField> = {
      name: 'name',
      locality_id: 'localityId',
      latitude: 'latitude',
      longitude: 'longitude',
      status: 'status',
    };
    const mapped: FormErrors = {};
    for (const [apiField, value] of Object.entries(rawErrors)) {
      const formField = fields[apiField];
      if (formField && Array.isArray(value) && typeof value[0] === 'string') mapped[formField] = value[0];
    }
    return mapped;
  }
}
