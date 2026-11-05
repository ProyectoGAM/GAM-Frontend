import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

import { Vehicle, VehicleDriverOption, VehicleInput } from '../interfaces/vehicle';

@Component({
  selector: 'app-vehicle-editor-dialog',
  imports: [IonIcon, ReactiveFormsModule],
  templateUrl: './vehicle-editor-dialog.component.html',
  styleUrls: ['./vehicle-dialog.scss', './vehicle-editor-dialog.component.scss'],
})
export class VehicleEditorDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly drivers = input.required<VehicleDriverOption[]>();
  readonly driverError = input<string | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  readonly saved = output<VehicleInput>();
  readonly vehicle = signal<Vehicle | null>(null);
  readonly unavailableDriver = computed(() => {
    const assigned = this.vehicle()?.habitual_driver;
    return assigned && !this.drivers().some(({ id }) => id === assigned.id) ? assigned : null;
  });
  readonly form = new FormGroup({
    plate: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(24)] }),
    make: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    model: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    year: new FormControl<number | null>(null, [Validators.min(1900), Validators.max(2100), Validators.pattern(/^\d+$/)]),
    admitted_at: new FormControl('', { nonNullable: true }),
    capacity_kg: new FormControl<number | null>(null, [Validators.min(0.01), Validators.max(99_999_999)]),
    habitual_driver_id: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });

  constructor() { addIcons({ closeOutline }); }

  open(vehicle: Vehicle | null = null): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) return;
    this.vehicle.set(vehicle);
    this.form.reset({
      plate: vehicle?.plate ?? '', make: vehicle?.make ?? '', model: vehicle?.model ?? '',
      year: vehicle?.year ?? null, admitted_at: vehicle?.admitted_at ?? '',
      capacity_kg: vehicle?.capacity_kg == null ? null : Number(vehicle.capacity_kg),
      habitual_driver_id: vehicle?.habitual_driver?.id.toString() ?? '', notes: vehicle?.notes ?? '',
    });
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  close(): void { this.dialog().nativeElement.close(); }

  cancel(event?: Event): void {
    event?.preventDefault();
    if (!this.saving()) this.close();
  }

  submit(): void {
    if (this.saving()) return;
    const { plate, make, model } = this.form.getRawValue();
    this.form.patchValue({ plate: plate.trim(), make: make.trim(), model: model.trim() });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.dialog().nativeElement.querySelector<HTMLElement>('input.ng-invalid')?.focus();
      return;
    }
    const value = this.form.getRawValue();
    const version = this.vehicle()?.version;
    this.saved.emit({
      ...value,
      admitted_at: value.admitted_at || null,
      habitual_driver_id: value.habitual_driver_id ? Number(value.habitual_driver_id) : null,
      ...(version === undefined ? {} : { version }),
    });
  }
}
