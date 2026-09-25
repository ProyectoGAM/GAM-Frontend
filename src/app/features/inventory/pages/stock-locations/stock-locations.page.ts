import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { inventoryErrorMessage, applyInventoryValidationErrors } from '../../services/inventory-errors';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { LoadState, MutationState } from '../../types/inventory-state.type';
import { PaginatedResponse, ReferenceOptions, StockLocation, StockLocationStatus } from '../../interfaces/inventory';

@Component({
  selector: 'app-inventory-stock-locations',
  templateUrl: './stock-locations.page.html',
  styleUrl: './stock-locations.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class StockLocationsPage {
  readonly auth = inject(AuthStore);
  private readonly api = inject(StockLocationsApi);
  private readonly references = inject(InventoryReferenceApi);
  readonly state = signal<LoadState>('idle');
  readonly mutation = signal<MutationState>('idle');
  readonly locations = signal<StockLocation[]>([]);
  readonly meta = signal<PaginatedResponse<StockLocation>['meta'] | null>(null);
  readonly options = signal<ReferenceOptions | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly editTarget = signal<StockLocation | null>(null);
  readonly editorOpen = signal(false);
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.manage') === true);
  readonly filters = new FormGroup({ search: new FormControl('', { nonNullable: true }), status: new FormControl('', { nonNullable: true }), production_unit_id: new FormControl('', { nonNullable: true }) });
  readonly form = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }), production_unit_id: new FormControl('', { nonNullable: true }) });

  constructor() {
    void this.loadReferences();
    void this.load();
  }

  async load(page = 1): Promise<void> {
    this.state.set('loading');
    this.error.set(null);
    try {
      const value = this.filters.getRawValue();
      const response = await firstValueFrom(this.api.list({ search: value.search || undefined, status: (value.status || undefined) as StockLocationStatus | undefined, production_unit_id: value.production_unit_id ? Number(value.production_unit_id) : undefined, per_page: 25, page }));
      this.locations.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudieron cargar las ubicaciones.'));
    }
  }

  async loadReferences(): Promise<void> {
    try { this.options.set((await firstValueFrom(this.references.options())).data); } catch { /* El filtro de UP puede quedar vacío sin bloquear el listado. */ }
  }

  clearFilters(): void {
    this.filters.reset({ search: '', status: '', production_unit_id: '' });
    void this.load();
  }

  startCreate(): void {
    this.editTarget.set(null);
    this.editorOpen.set(true);
    this.form.reset({ name: '', production_unit_id: '' });
    this.error.set(null);
  }

  startEdit(location: StockLocation): void {
    this.editTarget.set(location);
    this.editorOpen.set(true);
    this.form.reset({ name: location.name, production_unit_id: String(this.productionUnitId(location) ?? '') });
    this.error.set(null);
  }

  cancelEdit(): void { this.editTarget.set(null); this.editorOpen.set(false); this.form.reset({ name: '', production_unit_id: '' }); }

  async save(): Promise<void> {
    if (!this.canManage() || this.form.invalid || this.mutation() === 'submitting') { this.form.markAllAsTouched(); return; }
    this.mutation.set('submitting');
    this.error.set(null);
    this.success.set(null);
    const value = this.form.getRawValue();
    const body = { name: value.name.trim(), production_unit_id: value.production_unit_id ? Number(value.production_unit_id) : null };
    try {
      if (this.editTarget()) await firstValueFrom(this.api.update(this.editTarget()!.id, body));
      else await firstValueFrom(this.api.create(body));
      this.mutation.set('success');
      this.success.set(this.editTarget() ? 'Ubicación actualizada.' : 'Ubicación creada.');
      this.cancelEdit();
      await this.load(this.meta()?.current_page ?? 1);
    } catch (error) {
      this.mutation.set('error');
      applyInventoryValidationErrors(this.form, error);
      this.error.set(inventoryErrorMessage(error, 'No se pudo guardar la ubicación.'));
    }
  }

  async toggleStatus(location: StockLocation): Promise<void> {
    if (!this.canManage() || !window.confirm(`¿${location.status === 'active' ? 'Desactivar' : 'Activar'} la ubicación ${location.name}?`)) return;
    this.mutation.set('submitting');
    this.error.set(null);
    try {
      await firstValueFrom(this.api.setStatus(location.id, location.status === 'active' ? 'inactive' : 'active'));
      this.mutation.set('success');
      this.success.set('Estado actualizado.');
      await this.load(this.meta()?.current_page ?? 1);
    } catch (error) {
      this.mutation.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo cambiar el estado de la ubicación.'));
    }
  }

  productionUnitId(location: StockLocation): number | null {
    return location.production_unit?.id ?? null;
  }

  productionUnitName(location: StockLocation): string { return location.production_unit?.name ?? 'General'; }
}
