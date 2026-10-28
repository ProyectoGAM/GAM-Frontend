import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnit } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { inventoryErrorMessage, applyInventoryValidationErrors } from '../../services/inventory-errors';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { LoadState, MutationState } from '../../types/inventory-state.type';
import { PaginatedResponse, StockLocation, StockLocationStatus, StockLocationType } from '../../interfaces/inventory';
import { STOCK_LOCATION_TYPES, stockLocationTypeLabel } from '../../services/movement-product-policy';
import { InventoryConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { funnelOutline, searchOutline } from 'ionicons/icons';

@Component({
  selector: 'app-inventory-stock-locations',
  templateUrl: './stock-locations.page.html',
  styleUrl: './stock-locations.page.scss',
  imports: [InventoryConfirmationDialogComponent, ReactiveFormsModule, RouterLink, FilterDialogComponent, IonIcon],
})
export class StockLocationsPage {
  private readonly destroyRef = inject(DestroyRef);
  private loadVersion = 0;
  private editorTrigger: HTMLElement | null = null;
  readonly auth = inject(AuthStore);
  private readonly api = inject(StockLocationsApi);
  private readonly productionUnitsApi = inject(ProductionUnitsService);
  readonly unitContext = inject(AdminUnitContextService, { optional: true });
  readonly state = signal<LoadState>('idle');
  readonly mutation = signal<MutationState>('idle');
  readonly locations = signal<StockLocation[]>([]);
  readonly meta = signal<PaginatedResponse<StockLocation>['meta'] | null>(null);
  readonly productionUnits = signal<ProductionUnit[]>([]);
  readonly productionUnitsState = signal<LoadState>('idle');
  readonly productionUnitsError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly editTarget = signal<StockLocation | null>(null);
  readonly editorOpen = signal(false);
  readonly editorError = signal<string | null>(null);
  readonly submitAttempted = signal(false);
  readonly pendingStatusLocation = signal<StockLocation | null>(null);
  @ViewChild('locationsHeading', { static: true }) private locationsHeading!: ElementRef<HTMLElement>;
  @ViewChild('editorDialog', { static: true }) private editorDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('locationName', { static: true }) private locationName!: ElementRef<HTMLInputElement>;
  @ViewChild(InventoryConfirmationDialogComponent) private statusDialog!: InventoryConfirmationDialogComponent;
  @ViewChild(FilterDialogComponent, { static: true }) private filterDialog!: FilterDialogComponent;
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.manage') === true);
  readonly locationTypes = STOCK_LOCATION_TYPES;
  readonly filters = new FormGroup({ search: new FormControl('', { nonNullable: true }), type: new FormControl<StockLocationType | ''>('', { nonNullable: true }), status: new FormControl('', { nonNullable: true }), production_unit_id: new FormControl('', { nonNullable: true }) });
  private readonly appliedFilters = signal(this.filters.getRawValue());
  readonly activeFilterCount = computed(() => Number(Boolean(this.appliedFilters().status)) + Number(Boolean(this.appliedFilters().type))
    + Number(this.unitContext?.selectedId() == null && Boolean(this.appliedFilters().production_unit_id)));
  readonly editorUnits = computed(() => {
    const units = this.productionUnits();
    const current = this.editTarget()?.production_unit;
    return current && !units.some(unit => unit.id === current.id) ? [...units, current] : units;
  });
  readonly form = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }), production_unit_id: new FormControl('', { nonNullable: true }) });

  constructor() {
    addIcons({ funnelOutline, searchOutline });
    this.filters.controls.search.valueChanges.pipe(
      debounceTime(250), takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => { void this.searchLocations(); });
    void this.loadProductionUnits();
    if (this.unitContext) {
      effect(() => {
        const unitId = this.unitContext!.selectedId();
        this.filters.controls.production_unit_id.setValue(unitId === null ? '' : String(unitId));
        if (unitId === null) this.filters.controls.production_unit_id.enable({ emitEvent: false });
        else this.filters.controls.production_unit_id.disable({ emitEvent: false });
        this.appliedFilters.update(value => ({ ...value, production_unit_id: unitId === null ? '' : String(unitId) }));
        void untracked(() => this.load());
      });
    } else {
      void this.load();
    }
  }

  async load(page = 1): Promise<void> {
    const version = ++this.loadVersion;
    this.state.set('loading');
    this.error.set(null);
    try {
      const value = this.appliedFilters();
      const response = await firstValueFrom(this.api.list({ search: value.search || undefined, type: value.type || undefined, status: (value.status || undefined) as StockLocationStatus | undefined, production_unit_id: value.production_unit_id ? Number(value.production_unit_id) : undefined, per_page: 25, page }));
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.locations.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.state.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudieron cargar las ubicaciones.'));
    }
  }

  async loadProductionUnits(): Promise<void> {
    this.productionUnitsState.set('loading');
    this.productionUnitsError.set(null);
    try {
      const units = await firstValueFrom(this.productionUnitsApi.listAll());
      if (this.destroyRef.destroyed) return;
      this.productionUnits.set(units);
      this.productionUnitsState.set(units.length ? 'success' : 'empty');
    } catch {
      if (this.destroyRef.destroyed) return;
      // Keep the location list available even when the optional UP selectors cannot load.
      this.productionUnitsState.set('error');
      this.productionUnitsError.set('No se pudieron cargar las Unidades Productivas. Intentá nuevamente.');
    }
  }

  hasActiveFilters(): boolean {
    const value = this.appliedFilters();
    return Boolean(value.search || value.type || value.status || value.production_unit_id);
  }

  clearFilters(): void {
    this.filters.reset({ search: '', type: '', status: '', production_unit_id: this.unitContext?.selectedId()?.toString() ?? '' }, { emitEvent: false });
    void this.applyFilters();
  }

  async applyFilters(): Promise<void> {
    this.appliedFilters.set({ ...this.filters.getRawValue(), search: this.filters.controls.search.value.trim() });
    this.filterDialog.close();
    await this.load();
  }

  openFilters(trigger: HTMLElement): void {
    void this.searchLocations();
    const applied = this.appliedFilters();
    this.filters.patchValue({ type: applied.type, status: applied.status, production_unit_id: applied.production_unit_id });
    this.filterDialog.open(trigger);
  }

  clearDraftFilters(): void {
    this.filters.patchValue({ type: '', status: '', production_unit_id: this.unitContext?.selectedId()?.toString() ?? '' });
  }

  async searchLocations(): Promise<void> {
    const applied = this.appliedFilters();
    if (this.filters.controls.search.value.trim() === applied.search && this.state() !== 'error') return;
    this.filters.patchValue({ type: applied.type, status: applied.status, production_unit_id: applied.production_unit_id });
    await this.applyFilters();
  }

  startCreate(event?: Event): void {
    if (!this.canManage() || this.mutation() === 'submitting') return;
    this.editTarget.set(null);
    this.form.reset({ name: '', production_unit_id: this.unitContext?.selectedId()?.toString() ?? '' });
    this.openEditor(event);
  }

  startEdit(location: StockLocation, event?: Event): void {
    if (!this.canManage() || location.system_managed || this.mutation() === 'submitting') return;
    this.editTarget.set(location);
    this.form.reset({ name: location.name, production_unit_id: String(this.productionUnitId(location) ?? '') });
    this.openEditor(event);
  }

  private openEditor(event?: Event): void {
    this.editorTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.editorOpen.set(true);
    this.submitAttempted.set(false);
    this.editorError.set(null);
    this.mutation.set('idle');
    this.error.set(null);
    this.success.set(null);
    this.editorDialog.nativeElement.showModal();
    this.locationName.nativeElement.focus();
  }

  cancelEdit(): void {
    if (this.mutation() === 'submitting') return;
    this.editorDialog.nativeElement.close();
    this.editorOpen.set(false);
    this.editTarget.set(null);
    this.submitAttempted.set(false);
    this.editorError.set(null);
    this.form.reset({ name: '', production_unit_id: '' });
    if (this.editorTrigger?.isConnected) this.editorTrigger.focus();
  }

  onEditorCancel(event: Event): void {
    event.preventDefault();
    this.cancelEdit();
  }

  fieldErrorVisible(control: AbstractControl): boolean {
    return control.invalid && (this.submitAttempted() || (control.touched && control.dirty));
  }

  async save(): Promise<void> {
    if (!this.editorOpen() || !this.canManage() || this.editTarget()?.system_managed || this.mutation() === 'submitting') return;
    const name = this.form.controls.name;
    if (name.value !== name.value.trim()) name.setValue(name.value.trim());
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.locationName.nativeElement.focus();
      return;
    }
    this.mutation.set('submitting');
    this.editorError.set(null);
    this.success.set(null);
    const value = this.form.getRawValue();
    const body = { name: value.name.trim(), production_unit_id: value.production_unit_id ? Number(value.production_unit_id) : null };
    const target = this.editTarget();
    try {
      if (target) await firstValueFrom(this.api.update(target.id, body));
      else await firstValueFrom(this.api.create(body));
      if (this.destroyRef.destroyed) return;
      this.mutation.set('success');
      this.success.set(target ? 'Ubicación actualizada.' : 'Ubicación creada.');
      this.cancelEdit();
      await this.load(this.meta()?.current_page ?? 1);
      if (!this.destroyRef.destroyed) this.locationsHeading.nativeElement.focus();
    } catch (error) {
      if (this.destroyRef.destroyed) return;
      this.mutation.set('error');
      applyInventoryValidationErrors(this.form, error);
      this.editorError.set(inventoryErrorMessage(error, 'No se pudo guardar la ubicación.'));
    }
  }

  requestStatusChange(event: Event, location: StockLocation): void {
    if (!this.canManage() || location.system_managed || this.mutation() === 'submitting') return;
    this.pendingStatusLocation.set(location);
    this.error.set(null);
    this.success.set(null);
    this.statusDialog.open(event.currentTarget as HTMLElement | null);
  }

  dismissStatusChange(): void { this.pendingStatusLocation.set(null); }

  async toggleStatus(): Promise<void> {
    const location = this.pendingStatusLocation();
    if (!location || !this.canManage() || this.mutation() === 'submitting') return;
    const deactivating = location.status === 'active';
    this.mutation.set('submitting');
    this.error.set(null);
    this.success.set(null);
    try {
      await firstValueFrom(this.api.setStatus(location.id, deactivating ? 'inactive' : 'active'));
      this.mutation.set('success');
      this.success.set(deactivating ? 'Ubicación desactivada.' : 'Ubicación activada.');
      this.statusDialog.close();
      this.pendingStatusLocation.set(null);
      await this.load(this.meta()?.current_page ?? 1);
      this.locationsHeading.nativeElement.focus();
    } catch (error) {
      this.mutation.set('error');
      this.error.set(inventoryErrorMessage(error, 'No se pudo cambiar el estado de la ubicación.'));
    }
  }
  productionUnitId(location: StockLocation): number | null {
    return location.production_unit?.id ?? null;
  }

  productionUnitName(location: StockLocation): string { return location.production_unit?.name ?? 'General'; }

  locationTypeLabel(location: StockLocation): string {
    return stockLocationTypeLabel(location);
  }
}
