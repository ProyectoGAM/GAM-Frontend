import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { Vehicle, VehicleDriverOption, VehicleListResponse } from '../../interfaces/vehicle';
import { VehiclesApi } from '../../services/vehicles.api';
import { VehicleAvailability, VehicleStatus } from '../../types/vehicle.types';

@Component({
  selector: 'app-vehicle-list-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './vehicle-list.page.html',
  styleUrl: './vehicle-list.page.scss',
})
export class VehicleListPage {
  private readonly api = inject(VehiclesApi);
  private readonly auth = inject(AuthStore);
  readonly vehicles = signal<Vehicle[]>([]);
  readonly drivers = signal<VehicleDriverOption[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly availabilityFilter = signal('');
  readonly createOpen = signal(false);
  readonly total = signal(0);
  readonly canManage = computed(() => this.auth.user()?.roles.includes('admin') || this.auth.user()?.permissions?.includes('vehicles.manage') === true);
  readonly form = new FormGroup({
    plate: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(24)] }),
    make: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    model: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    year: new FormControl(''), admitted_at: new FormControl(''), capacity_kg: new FormControl(''), habitual_driver_id: new FormControl(''), notes: new FormControl(''),
  });

  constructor() { void this.load(); if (this.canManage()) void this.loadDrivers(); }

  async loadDrivers(): Promise<void> {
    try { this.drivers.set((await firstValueFrom(this.api.drivers())).data); }
    catch { this.error.set('No se pudieron cargar los repartidores para el conductor habitual.'); }
  }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try {
      const response: VehicleListResponse = await firstValueFrom(this.api.list({ search: this.search() || undefined, status: this.statusFilter() || undefined, availability: this.availabilityFilter() || undefined }));
      this.vehicles.set(response.data); this.total.set(response.meta?.total ?? response.data.length);
    } catch { this.error.set('No se pudo cargar la flota. Revisá tu conexión e intentá nuevamente.'); }
    finally { this.loading.set(false); }
  }

  async create(): Promise<void> {
    if (!this.canManage() || this.saving()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true); this.error.set(null);
    const value = this.form.getRawValue();
    const body = { ...value, year: value.year ? Number(value.year) : null, admitted_at: value.admitted_at || null, capacity_kg: value.capacity_kg || null, habitual_driver_id: value.habitual_driver_id ? Number(value.habitual_driver_id) : null };
    try {
      await firstValueFrom(this.api.create(body));
      this.form.reset(); this.createOpen.set(false); await this.load();
    } catch { this.error.set('No se pudo guardar el vehículo. Verificá que la matrícula no esté registrada.'); }
    finally { this.saving.set(false); }
  }

  setSearch(value: string): void { this.search.set(value); }
  setStatus(value: string): void { this.statusFilter.set(value); }
  setAvailability(value: string): void { this.availabilityFilter.set(value); }
  statusLabel(status: VehicleStatus): string { return status === 'active' ? 'Activo' : status === 'out_of_service' ? 'Fuera de servicio' : 'Retirado'; }
  availabilityLabel(value: VehicleAvailability): string { return value === 'available' ? 'Disponible' : value === 'in_use' ? 'En uso' : 'No disponible'; }
}
