import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner } from '@ionic/angular';

import { ProductionUnitLocationPickerComponent } from '../../components/production-unit-location-picker/production-unit-location-picker.component';
import { ProductionUnit, ProductionUnitLocationValue, UpdateProductionUnitRequest } from '../../interfaces/production-unit.interface';
import { ProductionUnitSearchContext } from '../../services/production-unit-geocoding.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { isValidProductionUnitPoint, productionUnitLocationPointValidator } from '../../types/production-unit-location.type';

@Component({
  selector: 'app-production-unit-edit-page',
  templateUrl: './production-unit-edit.page.html',
  styleUrl: './production-unit-edit.page.scss',
  imports: [IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner, ProductionUnitLocationPickerComponent, ReactiveFormsModule, RouterLink],
})
export class ProductionUnitEditPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private localityRequestId = 0;

  readonly unit = signal<ProductionUnit | null>(null);
  readonly localityId = signal<number | null>(null);
  readonly locationSearchContext = signal<ProductionUnitSearchContext>({});
  readonly localityResolutionPending = signal(false);
  readonly locationSelectionPending = signal(false);
  readonly state = signal<'loading' | 'ready' | 'error' | 'saved'>('loading');
  readonly saving = signal(false);
  readonly hasAttemptedSubmit = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly locationError = signal<string | null>(null);
  readonly initialLocation = computed(() => {
    const unit = this.unit();
    return unit ? { address: unit.address ?? null, latitude: unit.latitude, longitude: unit.longitude } : null;
  });

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)] }),
    location: new FormControl<ProductionUnitLocationValue | null>(null, productionUnitLocationPointValidator),
    status: new FormControl<'active' | 'inactive'>('active', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id < 1) { this.state.set('error'); return; }
    this.service.getById(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        this.unit.set(data);
        this.localityId.set(data.locality_id ?? data.locality?.id ?? null);
        this.locationSearchContext.set({
          locality: data.locality?.name ?? null,
          department: data.locality?.department?.name ?? null,
        });
        this.form.patchValue({
          name: data.name,
          location: this.locationValue(data),
          status: data.status === 'inactive' ? 'inactive' : 'active',
        });
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  onLocationChanged(location: ProductionUnitLocationValue | null): void {
    this.form.controls.location.setValue(location);
    this.form.controls.location.markAsTouched();
    this.locationError.set(null);
    this.locationSearchContext.set({
      locality: location?.administrativeContext?.locality ?? null,
      department: location?.administrativeContext?.department ?? null,
    });
    const unit = this.unit();
    const samePoint = Boolean(unit && location && unit.latitude != null && unit.longitude != null
      && Number(unit.latitude) === location.latitude && Number(unit.longitude) === location.longitude);
    if (samePoint) {
      this.localityId.set(unit?.locality_id ?? unit?.locality?.id ?? null);
      this.localityResolutionPending.set(false);
      this.localityRequestId += 1;
      return;
    }

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

  submit(): void {
    if (this.saving() || this.locationSelectionPending() || this.localityResolutionPending()) return;
    this.hasAttemptedSubmit.set(true);
    this.errorMessage.set(null);
    this.locationError.set(null);
    const unit = this.unit();
    const location = this.form.controls.location.value;
    if (!unit) return;

    const latitude = location?.latitude;
    const longitude = location?.longitude;
    const address = location?.address?.trim() ?? '';
    const samePoint = latitude != null && longitude != null && unit.latitude != null && unit.longitude != null
      && Number(unit.latitude) === latitude && Number(unit.longitude) === longitude;
    const unchangedHistoricPoint = samePoint && !unit.address?.trim() && location?.isConfirmed === true && !address;
    const confirmedAddress = location?.isConfirmed === true && address.length > 0 && address.length <= 500;
    const validLocation = latitude != null && longitude != null && isValidProductionUnitPoint(latitude, longitude)
      && (confirmedAddress || unchangedHistoricPoint);
    if (this.form.invalid || !validLocation) {
      this.form.markAllAsTouched();
      if (!validLocation) this.locationError.set('Confirmá una dirección para el punto seleccionado antes de guardar.');
      return;
    }
    if (!location || latitude == null || longitude == null) return;

    const value = this.form.getRawValue();
    const request: UpdateProductionUnitRequest = {
      name: value.name.trim(),
      locality_id: this.localityId(),
      latitude,
      longitude,
    };
    if (address) request.address = address;
    if (value.status !== unit.status) request.status = value.status;

    this.saving.set(true);
    this.service.update(unit.id, request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => { this.unit.set(data); this.saving.set(false); this.state.set('saved'); },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.errorMessage.set('No se pudo cambiar el estado porque hay galpones que impiden esa transición.');
        } else {
          const locationError = this.validationLocationError(error);
          if (locationError) this.locationError.set(locationError);
          this.errorMessage.set('No se pudieron guardar los cambios. Revisá los datos e intentá nuevamente.');
        }
      },
    });
  }

  private locationValue(unit: ProductionUnit): ProductionUnitLocationValue | null {
    if (unit.latitude == null || unit.longitude == null) return null;
    const latitude = Number(unit.latitude);
    const longitude = Number(unit.longitude);
    if (!isValidProductionUnitPoint(latitude, longitude)) return null;
    return { address: unit.address ?? null, latitude, longitude, isConfirmed: true };
  }

  private validationLocationError(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse) || error.status !== 422) return null;
    const errors: unknown = error.error?.errors;
    if (typeof errors !== 'object' || errors === null) return null;
    for (const field of ['address', 'latitude', 'longitude']) {
      const messages = (errors as Record<string, unknown>)[field];
      if (Array.isArray(messages) && typeof messages[0] === 'string') return messages[0];
    }
    return null;
  }
}
