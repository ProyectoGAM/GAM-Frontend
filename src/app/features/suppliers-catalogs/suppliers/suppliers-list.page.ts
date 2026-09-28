import { Component, inject, signal, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { InventoryConfirmationDialogComponent } from '../../inventory/components/confirmation-dialog/confirmation-dialog.component';
import { Supplier, SupplierListFilters, SupplierListResponse, SupplierStatus } from './suppliers.models';
import { SuppliersApi } from './suppliers.api';

type PageState = 'loading' | 'empty' | 'success' | 'error';

const PAGE_SIZE = 25;
const SUPPLIERS_PATH = '/administracion/proveedores/proveedores';

@Component({
  selector: 'app-suppliers-list',
  templateUrl: './suppliers-list.page.html',
  styleUrl: './suppliers-list.page.scss',
  imports: [InventoryConfirmationDialogComponent, RouterLink],
})
export class SuppliersListPage {
  private readonly api = inject(SuppliersApi);
  private readonly router = inject(Router);
  private requestId = 0;

  readonly state = signal<PageState>('loading');
  readonly suppliers = signal<Supplier[]>([]);
  readonly meta = signal<SupplierListResponse['meta'] | null>(null);
  readonly error = signal<string | null>(null);
  readonly pendingStatusSupplier = signal<Supplier | null>(null);
  readonly statusMutation = signal<'idle' | 'submitting' | 'error'>('idle');
  readonly statusChangeError = signal<string | null>(null);
  readonly statusFeedback = signal<string | null>(null);
  readonly search = signal('');
  readonly status = signal<SupplierStatus | ''>('');
  readonly filters = signal<SupplierListFilters>({ per_page: PAGE_SIZE });
  readonly createdFeedback = signal(
    this.router.getCurrentNavigation()?.extras.state?.['supplierCreated'] === true,
  );
  readonly updatedFeedback = signal(
    this.router.getCurrentNavigation()?.extras.state?.['supplierUpdated'] === true,
  );
  @ViewChild(InventoryConfirmationDialogComponent) private statusDialog!: InventoryConfirmationDialogComponent;

  constructor() {
    void this.load();
  }

  async load(page = 1, filters = this.filters()): Promise<void> {
    const requestId = ++this.requestId;
    this.state.set('loading');
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.list(filters, page));
      if (requestId !== this.requestId) return;
      this.suppliers.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch {
      if (requestId !== this.requestId) return;
      this.state.set('error');
      this.error.set('No se pudieron cargar los proveedores. Intentá nuevamente.');
    }
  }

  applyFilters(): void {
    this.filters.set({
      ...(this.search().trim() ? { search: this.search().trim() } : {}),
      ...(this.status() ? { status: this.status() as SupplierStatus } : {}),
      per_page: PAGE_SIZE,
    });
    void this.load(1);
  }

  clearFilters(): void {
    this.search.set('');
    this.status.set('');
    this.filters.set({ per_page: PAGE_SIZE });
    void this.load(1);
  }

  setSearch(value: string): void { this.search.set(value); }

  setStatus(value: string): void {
    this.status.set(value === 'active' || value === 'inactive' ? value : '');
  }

  statusLabel(supplierStatus: SupplierStatus): string {
    return supplierStatus === 'active' ? 'Activo' : 'Inactivo';
  }

  locationLabel(supplier: Supplier): string {
    return supplier.locality
      ? `${supplier.locality.name}, ${supplier.locality.department.name}`
      : 'Sin localidad asignada';
  }

  editSupplier(supplier: Supplier): void {
    void this.router.navigate([SUPPLIERS_PATH, supplier.id, 'editar'], { state: { supplier } });
  }

  requestStatusChange(event: Event, supplier: Supplier): void {
    if (this.statusMutation() === 'submitting') return;
    this.pendingStatusSupplier.set(supplier);
    this.statusMutation.set('idle');
    this.statusChangeError.set(null);
    this.statusFeedback.set(null);
    this.statusDialog.open(event.currentTarget as HTMLElement | null);
  }

  dismissStatusChange(): void {
    if (this.statusMutation() === 'submitting') return;
    this.pendingStatusSupplier.set(null);
    this.statusMutation.set('idle');
    this.statusChangeError.set(null);
  }

  async confirmStatusChange(): Promise<void> {
    const supplier = this.pendingStatusSupplier();
    if (!supplier || this.statusMutation() === 'submitting') return;
    const nextStatus: SupplierStatus = supplier.status === 'active' ? 'inactive' : 'active';
    this.statusMutation.set('submitting');
    this.statusChangeError.set(null);
    this.statusFeedback.set(null);
    try {
      await firstValueFrom(this.api.changeSupplierStatus(supplier.id, nextStatus));
      this.statusMutation.set('idle');
      this.statusDialog.close();
      this.pendingStatusSupplier.set(null);
      this.statusFeedback.set(nextStatus === 'inactive'
        ? 'Proveedor desactivado correctamente.'
        : 'Proveedor activado correctamente.');
      await this.load(this.meta()?.current_page ?? 1, this.filters());
    } catch {
      this.statusMutation.set('error');
      this.statusChangeError.set('No se pudo cambiar el estado del proveedor. Intentá nuevamente.');
    }
  }
}
