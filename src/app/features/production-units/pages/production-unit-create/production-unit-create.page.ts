import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner, IonText } from '@ionic/angular';

import { ProductionUnitLocationPickerComponent } from '../../components/production-unit-location-picker/production-unit-location-picker.component';
import { ProductionUnitLocationValue } from '../../interfaces/production-unit.interface';
import { ProductionUnitSearchContext } from '../../services/production-unit-geocoding.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { isValidProductionUnitPoint, productionUnitLocationPointValidator } from '../../types/production-unit-location.type';

type ErrorField = 'name' | 'location' | 'status';
type FormErrors = Partial<Record<ErrorField, string>>;

@Component({
  selector: 'app-production-unit-create-page',
  templateUrl: './production-unit-create.page.html',
  styleUrl: './production-unit-create.page.scss',
  imports: [IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner, IonText, ProductionUnitLocationPickerComponent, ReactiveFormsModule, RouterLink],
})
export class ProductionUnitCreatePage {
  private readonly service = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  private localityRequestId = 0;

  readonly localityId = signal<number | null>(null);
  readonly locationSearchContext = signal<ProductionUnitSearchContext>({});
  readonly localityResolutionPending = signal(false);
  readonly locationSelectionPending = signal(false);
  readonly isSubmitting = signal(false);
  readonly hasAttemptedSubmit = signal(false);
  readonly formErrors = signal<FormErrors>({});
  readonly locationError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly createdUnitName = signal<string | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)] }),
    location: new FormControl<ProductionUnitLocationValue | null>(null, productionUnitLocationPointValidator),
    status: new FormControl<'active' | 'inactive'>('active', { nonNullable: true, validators: [Validators.required] }),
  });

  onLocationChanged(location: ProductionUnitLocationValue | null): void {
    this.form.controls.location.setValue(location);
    this.form.controls.location.markAsTouched();
    this.locationError.set(null);
    this.locationSearchContext.set({
      locality: location?.administrativeContext?.locality ?? null,
      department: location?.administrativeContext?.department ?? null,
    });
    this.localityId.set(null);
    const requestId = ++this.localityRequestId;
    const context = location?.administrativeContext;
    if (!context?.locality || !context.department) {
      this.localityResolutionPending.set(false);
      return;
    }

    this.localityResolutionPending.set(true);
    this.service.resolveLocalityId(context).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => {
      if (requestId !== this.localityRequestId) return;
      this.localityId.set(id);
      this.localityResolutionPending.set(false);
    });
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
    if (this.isSubmitting() || this.locationSelectionPending() || this.localityResolutionPending()) return;
    this.hasAttemptedSubmit.set(true);
    this.submitError.set(null);

    const location = this.form.controls.location.value;
    const latitude = location?.latitude;
    const longitude = location?.longitude;
    const address = location?.address?.trim() ?? '';
    const hasConfirmedLocation = location !== null && latitude != null && longitude != null
      && isValidProductionUnitPoint(latitude, longitude)
      && location.isConfirmed && address.length > 0 && address.length <= 500;

    if (this.form.invalid || !hasConfirmedLocation) {
      this.form.markAllAsTouched();
      if (!hasConfirmedLocation) this.locationError.set('Elegí un punto en el mapa y confirmá una dirección para esa ubicación.');
      return;
    }

    if (latitude == null || longitude == null) return;
    this.formErrors.set({});
    this.isSubmitting.set(true);
    this.service.create({
      locality_id: this.localityId(),
      name: this.form.controls.name.value.trim(),
      address,
      latitude,
      longitude,
      status: this.form.controls.status.value,
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

  private handleCreateError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.submitError.set('No se pudo crear la unidad productiva. Intentá nuevamente.');
      return;
    }
    if (error.status === 403 || error.status === 401) {
      this.submitError.set('No tienes permiso para crear unidades productivas.');
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
    const fields: Record<string, ErrorField> = { name: 'name', address: 'location', latitude: 'location', longitude: 'location', status: 'status' };
    const mapped: FormErrors = {};
    for (const [apiField, value] of Object.entries(rawErrors)) {
      const formField = fields[apiField];
      if (formField && Array.isArray(value) && typeof value[0] === 'string') mapped[formField] = value[0];
    }
    return mapped;
  }
}
