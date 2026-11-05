import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowForwardOutline, carOutline, chevronForwardOutline, funnelOutline, searchOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { VehicleEditorDialogComponent } from '../../components/vehicle-editor-dialog.component';
import { VehicleSummaryComponent } from '../../components/vehicle-summary.component';
import { Vehicle, VehicleDriverOption, VehicleInput, VehicleListResponse } from '../../interfaces/vehicle';
import { VehiclesApi } from '../../services/vehicles.api';

@Component({
  selector: 'app-vehicle-list-page',
  imports: [FilterDialogComponent, IonIcon, RouterLink, VehicleEditorDialogComponent, VehicleSummaryComponent],
  templateUrl: './vehicle-list.page.html',
  styleUrl: './vehicle-list.page.scss',
})
export class VehicleListPage {
  private readonly api = inject(VehiclesApi);
  private readonly auth = inject(AuthStore);
  private readonly filtersDialog = viewChild.required(FilterDialogComponent);
  private readonly editor = viewChild(VehicleEditorDialogComponent);
  readonly vehicles = signal<Vehicle[]>([]);
  readonly drivers = signal<VehicleDriverOption[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly editorError = signal<string | null>(null);
  readonly driverError = signal<string | null>(null);
  readonly search = signal('');
  readonly draftStatus = signal('');
  readonly draftAvailability = signal('');
  private readonly filters = signal({ search: '', status: '', availability: '' });
  private request = 0;
  readonly filterCount = computed(() => Number(!!this.filters().status) + Number(!!this.filters().availability));
  readonly total = signal(0);
  readonly canManage = computed(() => this.auth.user()?.roles.includes('admin') || this.auth.user()?.permissions?.includes('vehicles.manage') === true);
  constructor() {
    addIcons({ addOutline, arrowForwardOutline, carOutline, chevronForwardOutline, funnelOutline, searchOutline });
    void this.load();
    if (this.canManage()) void this.loadDrivers();
  }

  async loadDrivers(): Promise<void> {
    try { this.drivers.set((await firstValueFrom(this.api.drivers())).data); }
    catch { this.driverError.set('No se pudieron cargar los repartidores para el conductor habitual.'); }
  }

  async load(): Promise<void> {
    const request = ++this.request;
    const { search, status, availability } = this.filters();
    this.loading.set(true); this.error.set(null);
    try {
      const response: VehicleListResponse = await firstValueFrom(this.api.list({ search: search || undefined, status: status || undefined, availability: availability || undefined }));
      if (request !== this.request) return;
      this.vehicles.set(response.data); this.total.set(response.meta?.total ?? response.data.length);
    } catch {
      if (request === this.request) this.error.set('No se pudo cargar la flota. Revisá tu conexión e intentá nuevamente.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editorError.set(null);
    this.editor()?.open();
  }

  async create(body: VehicleInput): Promise<void> {
    if (!this.canManage() || this.saving()) return;
    this.saving.set(true); this.editorError.set(null);
    try {
      await firstValueFrom(this.api.create(body));
      this.editor()?.close();
      await this.load();
    } catch { this.editorError.set('No se pudo guardar el vehículo. Verificá que la matrícula no esté registrada.'); }
    finally { this.saving.set(false); }
  }

  searchFleet(): void {
    this.filters.update((filters) => ({ ...filters, search: this.search().trim() }));
    void this.load();
  }

  openFilters(trigger: HTMLElement): void {
    const { status, availability } = this.filters();
    this.draftStatus.set(status);
    this.draftAvailability.set(availability);
    this.filtersDialog().open(trigger);
  }

  clearFilters(): void {
    this.draftStatus.set('');
    this.draftAvailability.set('');
  }

  applyFilters(): void {
    this.filters.set({ search: this.search().trim(), status: this.draftStatus(), availability: this.draftAvailability() });
    this.filtersDialog().close();
    void this.load();
  }
}
