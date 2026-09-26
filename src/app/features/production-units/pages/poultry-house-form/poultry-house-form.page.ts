import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { businessOutline, eggOutline, leafOutline } from 'ionicons/icons';

import { CreatePoultryHouseRequest, PoultryHouseDetail, PoultryHouseType, ProductionUnit, UpdatePoultryHouseRequest } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';

type PageState = 'loading' | 'ready' | 'empty' | 'offline' | 'forbidden' | 'notFound' | 'error';
type FormField = 'unitId' | 'type' | 'name' | 'capacity';
type FieldErrors = Partial<Record<FormField, string>>;

@Component({
  selector: 'app-poultry-house-form-page',
  templateUrl: './poultry-house-form.page.html',
  styleUrl: './poultry-house-form.page.scss',
  imports: [IonButton, IonCard, IonCardContent, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner, ReactiveFormsModule, RouterLink],
})
export class PoultryHouseFormPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly isEdit = this.route.snapshot.paramMap.has('houseId');
  readonly state = signal<PageState>('loading');
  readonly units = signal<ProductionUnit[]>([]);
  readonly selectedUnit = signal<ProductionUnit | null>(null);
  readonly house = signal<PoultryHouseDetail | null>(null);
  readonly saving = signal(false);
  readonly attempted = signal(false);
  readonly fieldErrors = signal<FieldErrors>({});
  readonly message = signal<string | null>(null);
  readonly cancelPath = signal('/administracion/ubicaciones/galpones');

  readonly form = new FormGroup({
    type: new FormControl<PoultryHouseType>('poultry', { nonNullable: true }),
    unitId: new FormControl<number | null>(null, Validators.required),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)] }),
    capacity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)] }),
  });

  constructor() {
    addIcons({ businessOutline, eggOutline, leafOutline });
  }

  ngOnInit(): void {
    if (this.isEdit) {
      this.loadHouse();
      return;
    }
    this.setType(this.route.snapshot.queryParamMap.get('type') === 'feed' ? 'feed' : 'poultry');
    this.loadUnits();
  }

  retry(): void {
    if (this.isEdit) this.loadHouse();
    else this.loadUnits();
  }

  setType(type: PoultryHouseType): void {
    if (this.isEdit) return;
    this.applyType(type);
    this.cancelPath.set(type === 'feed'
      ? '/administracion/ubicaciones/plantas-de-racion'
      : '/administracion/ubicaciones/galpones');
    this.clearFieldError('type');
  }

  onUnitChanged(value: number | string | null | undefined): void {
    const id = value == null || value === '' ? null : Number(value);
    this.form.controls.unitId.setValue(id);
    this.selectedUnit.set(this.units().find((unit) => unit.id === id) ?? null);
    this.clearFieldError('unitId');
  }

  clearFieldError(field: FormField): void {
    this.message.set(null);
    this.fieldErrors.update((errors) => {
      const next = { ...errors };
      delete next[field];
      return next;
    });
  }

  submit(): void {
    if (this.saving()) return;
    this.attempted.set(true);
    this.message.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const name = value.name.trim();
    const capacity = Number(value.capacity);
    if (value.type === 'poultry' && (!Number.isSafeInteger(capacity) || capacity < 1)) {
      this.fieldErrors.set({ capacity: 'Ingresá una capacidad válida mayor que cero.' });
      return;
    }
    this.fieldErrors.set({});

    if (this.isEdit) {
      const house = this.house();
      if (!house) return;
      const request: UpdatePoultryHouseRequest = {};
      if (name !== house.name) request.name = name;
      if (house.type === 'poultry' && capacity !== house.bird_capacity) request.bird_capacity = capacity;
      if (Object.keys(request).length === 0) {
        this.message.set('No hay cambios para guardar.');
        return;
      }
      this.saving.set(true);
      this.service.updatePoultryHouse(house.id, request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => { this.saving.set(false); void this.goToDetail(house.production_unit_id, house.id); },
        error: (error: unknown) => this.handleSaveError(error),
      });
      return;
    }

    if (value.unitId === null || !this.selectedUnit()) return;
    const request: CreatePoultryHouseRequest = value.type === 'poultry'
      ? { name, type: 'poultry', bird_capacity: capacity }
      : { name, type: 'feed' };
    this.saving.set(true);
    this.service.createPoultryHouse(value.unitId, request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => { this.saving.set(false); void this.goToDetail(value.unitId!, data.id); },
      error: (error: unknown) => this.handleSaveError(error),
    });
  }

  private applyType(type: PoultryHouseType): void {
    this.form.controls.type.setValue(type);
    const capacity = this.form.controls.capacity;
    if (type === 'feed') {
      capacity.setValue('');
      capacity.clearValidators();
    } else {
      capacity.setValidators([Validators.required, Validators.pattern(/^[1-9]\d*$/)]);
    }
    capacity.updateValueAndValidity();
    this.fieldErrors.update((errors) => ({ ...errors, capacity: undefined }));
  }

  private loadUnits(): void {
    this.state.set('loading');
    this.service.listAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (units) => {
        const active = units.filter((unit) => unit.status === 'active');
        this.units.set(active);
        const requestedId = this.form.controls.unitId.value
          ?? Number(this.route.snapshot.queryParamMap.get('unitId'));
        const selected = active.find((unit) => unit.id === requestedId) ?? null;
        this.form.controls.unitId.setValue(selected?.id ?? null);
        this.selectedUnit.set(selected);
        this.state.set(active.length ? 'ready' : 'empty');
      },
      error: (error: unknown) => this.state.set(this.errorState(error)),
    });
  }

  private loadHouse(): void {
    const houseId = Number(this.route.snapshot.paramMap.get('houseId'));
    const unitId = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(houseId) || houseId < 1 || !Number.isInteger(unitId) || unitId < 1) {
      this.state.set('notFound');
      return;
    }
    this.state.set('loading');
    this.service.getPoultryHouseById(houseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        if (data.production_unit_id !== unitId) { this.state.set('notFound'); return; }
        this.house.set(data);
        this.selectedUnit.set(data.production_unit);
        this.form.patchValue({ unitId, name: data.name, capacity: data.bird_capacity?.toString() ?? '' });
        this.applyType(data.type);
        if (data.type === 'poultry') this.form.controls.capacity.setValue(data.bird_capacity?.toString() ?? '');
        this.form.markAsPristine();
        this.cancelPath.set(`/administracion/ubicaciones/unidades-productivas/${unitId}/galpon/${houseId}`);
        this.state.set('ready');
      },
      error: (error: unknown) => this.state.set(this.errorState(error)),
    });
  }

  private handleSaveError(error: unknown): void {
    this.saving.set(false);
    if (!(error instanceof HttpErrorResponse)) {
      this.message.set('No se pudieron guardar los cambios. Intentá nuevamente.');
      return;
    }
    if (error.status === 422) {
      this.fieldErrors.set(this.mapFieldErrors(error.error));
      this.message.set('Revisá los campos señalados.');
    } else if (error.status === 409) {
      this.message.set(`${this.problemMessage(error.error) ?? 'Los datos cambiaron.'} Se cargaron los datos actuales.`);
      if (this.isEdit) this.loadHouse();
      else this.loadUnits();
    } else if (error.status === 401 || error.status === 403) {
      this.message.set('No tenés permiso para guardar esta instalación.');
    } else if (error.status === 404) {
      this.state.set('notFound');
    } else if (error.status === 0) {
      this.message.set('Sin conexión. Revisá tu conexión e intentá nuevamente.');
    } else {
      this.message.set('No se pudieron guardar los cambios. Intentá nuevamente.');
    }
  }

  private mapFieldErrors(body: unknown): FieldErrors {
    if (typeof body !== 'object' || body === null || !('errors' in body)) return {};
    const raw = body.errors;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const fields: Record<string, FormField> = { name: 'name', type: 'type', bird_capacity: 'capacity', production_unit_id: 'unitId' };
    const mapped: FieldErrors = {};
    for (const [key, messages] of Object.entries(raw)) {
      if (fields[key] && Array.isArray(messages) && typeof messages[0] === 'string') mapped[fields[key]] = messages[0];
    }
    return mapped;
  }

  private problemMessage(body: unknown): string | null {
    return typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
      ? body.message : null;
  }

  private errorState(error: unknown): PageState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 404) return 'notFound';
      if (error.status === 0) return 'offline';
    }
    return 'error';
  }

  private goToDetail(unitId: number, houseId: number): Promise<boolean> {
    return this.router.navigate(['/administracion/ubicaciones/unidades-productivas', unitId, 'galpon', houseId]);
  }
}
