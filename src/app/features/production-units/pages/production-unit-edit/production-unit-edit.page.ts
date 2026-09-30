import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner } from '@ionic/angular';
import { of, switchMap } from 'rxjs';

import { GeographyDepartment, GeographyLocality, ProductionUnit } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';

@Component({
  selector: 'app-production-unit-edit-page',
  templateUrl: './production-unit-edit.page.html',
  styleUrl: './production-unit-edit.page.scss',
  imports: [IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner, ReactiveFormsModule, RouterLink],
})
export class ProductionUnitEditPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly unit = signal<ProductionUnit | null>(null);
  readonly departments = signal<GeographyDepartment[]>([]);
  readonly localities = signal<GeographyLocality[]>([]);
  readonly state = signal<'loading' | 'ready' | 'error' | 'saved'>('loading');
  readonly localitiesLoading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)] }),
    departmentId: new FormControl<number | null>(null, Validators.required),
    localityId: new FormControl<number | null>({ value: null, disabled: true }, Validators.required),
    latitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-180), Validators.max(180)]),
    status: new FormControl<'active' | 'inactive'>('active', { nonNullable: true }),
  });

  constructor() { addIcons({ informationCircleOutline }); }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id < 1) { this.state.set('error'); return; }
    this.service.getById(id).pipe(
      switchMap(({ data }) => {
        this.unit.set(data);
        this.form.patchValue({ name: data.name, departmentId: data.locality.department_id, localityId: data.locality.id,
          latitude: data.latitude == null ? null : Number(data.latitude), longitude: data.longitude == null ? null : Number(data.longitude),
          status: data.status === 'inactive' ? 'inactive' : 'active' });
        this.form.controls.localityId.enable();
        return this.service.departments().pipe(switchMap((departments) => {
          this.departments.set(departments);
          return this.service.localities(data.locality.department_id);
        }));
      }), takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (localities) => { this.localities.set(localities); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  onDepartmentChanged(value: number | string | null | undefined): void {
    const departmentId = value == null || value === '' ? null : Number(value);
    this.form.controls.departmentId.setValue(departmentId);
    this.form.controls.localityId.reset(null);
    this.form.controls.localityId.disable();
    this.localities.set([]);
    if (!departmentId || !Number.isInteger(departmentId)) return;
    this.localitiesLoading.set(true);
    this.service.localities(departmentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (localities) => { this.localities.set(localities); this.localitiesLoading.set(false); if (localities.length) this.form.controls.localityId.enable(); },
      error: () => { this.localitiesLoading.set(false); this.errorMessage.set('No se pudieron cargar las localidades.'); },
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) { this.form.markAllAsTouched(); return; }
    const unit = this.unit();
    const localityId = this.form.controls.localityId.value;
    if (!unit || localityId === null) return;
    const id = unit.id;
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.update(id, { name: value.name.trim(), locality_id: localityId, latitude: Number(value.latitude), longitude: Number(value.longitude) })
      .pipe(switchMap((response) => value.status === unit.status ? of(response) : this.service.updateStatus(id, value.status)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => { if (response) this.unit.set(response.data); this.saving.set(false); this.state.set('saved'); },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(error instanceof HttpErrorResponse && error.status === 409
            ? 'No se pudo cambiar el estado porque hay galpones que impiden esa transición.'
            : 'No se pudieron guardar los cambios. Revisá los datos e intentá nuevamente.');
        },
      });
  }
}
