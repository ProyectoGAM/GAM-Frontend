import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { GeographyDepartment, GeographyLocality } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { Customer, CustomerInput } from '../../interfaces/customer';
import { CustomersApi } from '../../services/customers.api';
import { CustomerPendingCommands } from '../../services/customer-pending-commands';
import { PendingCustomerCommand } from '../../types/customer-command.type';
import { customerErrorMessage, hasUncertainCustomerResult } from '../../services/customer-errors';
import { CustomerLocationComponent } from '../customer-location/customer-location.component';

@Component({
  selector: 'app-customer-form',
  templateUrl: './customer-form.component.html',
  styleUrls: ['../../customers.scss'],
  imports: [ReactiveFormsModule, CustomerLocationComponent],
})
export class CustomerFormComponent implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly geography = inject(ProductionUnitsService);
  private readonly commands = inject(CustomerPendingCommands);
  private readonly destroyRef = inject(DestroyRef);
  private readonly initialOwner = this.commands.owner();
  private localityRequest = 0;
  readonly customer = input<Customer | null>(null);
  readonly saved = output<Customer>();
  readonly cancelled = output<void>();
  readonly busyChanged = output<boolean>();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly pending = signal<PendingCustomerCommand | null>(null);
  readonly departments = signal<GeographyDepartment[]>([]);
  readonly localities = signal<GeographyLocality[]>([]);
  readonly departmentId = signal<number | null>(null);
  readonly geographyError = signal<string | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    business_name: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    document_type: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(40)] }),
    document_number: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email, Validators.maxLength(254)] }),
    locality_id: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(240)] }),
    latitude: new FormControl('', { nonNullable: true }), longitude: new FormControl('', { nonNullable: true }),
    visit_frequency: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(240)] }),
    commercial_conditions: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    delivery_notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });
  readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly locked = computed(() => this.busy() || this.pending() !== null || this.initialOwner !== this.commands.owner());

  ngOnInit(): void {
    const customer = this.customer();
    if (customer) this.patch(customer);
    const pending = this.commands.get(this.scope());
    if (pending && (pending.kind === 'create' || pending.kind === 'update')) { this.pending.set(pending); this.patch(pending.body); }
    this.departmentId.set(customer?.locality?.department_id ?? null);
    void this.loadGeography();
  }

  async loadGeography(): Promise<void> {
    this.geographyError.set(null);
    try {
      const departments = await firstValueFrom(this.geography.departments());
      if (this.destroyRef.destroyed) return;
      this.departments.set(departments);
      if (this.departmentId()) await this.loadLocalities(this.departmentId()!);
    } catch { if (!this.destroyRef.destroyed) this.geographyError.set('No se pudieron cargar las localidades. Podés guardar la ficha conservando los datos actuales.'); }
  }

  selectDepartment(value: string): void {
    const id = value ? Number(value) : null;
    this.departmentId.set(id); this.form.controls.locality_id.setValue(''); this.localities.set([]); this.localityRequest++;
    if (id) void this.loadLocalities(id);
  }

  private async loadLocalities(departmentId: number): Promise<void> {
    const request = ++this.localityRequest;
    try {
      const localities = await firstValueFrom(this.geography.localities(departmentId));
      if (!this.destroyRef.destroyed && request === this.localityRequest) this.localities.set(localities);
    } catch { if (!this.destroyRef.destroyed && request === this.localityRequest) this.geographyError.set('No se pudieron cargar las localidades. Podés guardar sin cambiar la localidad actual.'); }
  }

  pointSelected(point: { latitude: string; longitude: string }): void { if (!this.locked()) this.form.patchValue(point); }

  async submit(): Promise<void> {
    if (this.busy() || this.commands.owner() !== this.initialOwner) return;
    this.error.set(null);
    let command = this.pending();
    if (!command) {
      this.form.markAllAsTouched();
      if (this.form.invalid) { this.error.set('Revisá los campos: hay un valor inválido o demasiado largo.'); return; }
      const value = this.form.getRawValue();
      if (Boolean(value.document_type.trim()) !== Boolean(value.document_number.trim())) { this.error.set('Indicá el tipo y el número de documento, o dejá ambos vacíos.'); return; }
      if (Boolean(value.latitude.trim()) !== Boolean(value.longitude.trim())) { this.error.set('Indicá ambas coordenadas o dejá ambas vacías.'); return; }
      if (value.latitude && (!Number.isFinite(Number(value.latitude)) || Math.abs(Number(value.latitude)) > 90 || !Number.isFinite(Number(value.longitude)) || Math.abs(Number(value.longitude)) > 180)) { this.error.set('Revisá la latitud y la longitud.'); return; }
      const body: CustomerInput = { ...value, locality_id: value.locality_id ? Number(value.locality_id) : null };
      command = { kind: this.customer() ? 'update' : 'create', key: crypto.randomUUID(), body };
      this.pending.set(command); this.commands.remember(this.scope(), command);
    }
    if (command.kind !== 'create' && command.kind !== 'update') return;
    this.setBusy(true);
    try {
      const response = await firstValueFrom(command.kind === 'create' ? this.api.create(command.body, command.key) : this.api.update(this.customer()!.id, command.body, command.key));
      if (this.destroyRef.destroyed || this.commands.owner() !== this.initialOwner) return;
      this.commands.forget(this.scope()); this.pending.set(null); this.saved.emit(response.data);
    } catch (error) {
      if (this.destroyRef.destroyed || this.commands.owner() !== this.initialOwner) return;
      if (!hasUncertainCustomerResult(error)) { this.commands.forget(this.scope()); this.pending.set(null); }
      this.error.set(customerErrorMessage(error, 'No se pudo guardar el cliente.'));
    } finally { if (!this.destroyRef.destroyed) this.setBusy(false); }
  }

  private scope(): string { return `form:${this.customer()?.id ?? 'new'}`; }
  private setBusy(value: boolean): void { this.busy.set(value); this.busyChanged.emit(value); }
  private patch(data: CustomerInput): void {
    const controls = this.form.controls;
    for (const key of Object.keys(controls) as Array<keyof typeof controls>) {
      controls[key].setValue(data[key] === null || data[key] === undefined ? '' : String(data[key]));
    }
  }
}
