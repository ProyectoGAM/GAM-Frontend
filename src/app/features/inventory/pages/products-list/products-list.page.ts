import { Component, computed, DestroyRef, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CatalogHeaderComponent } from '../../components/catalog-header/catalog-header.component';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { funnelOutline, searchOutline } from 'ionicons/icons';

import { InventoryConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { ProductsApi } from '../../services/products.api';
import { baseUnitLabel, PaginatedProducts, Product, ProductStatus, ProductKind, PRODUCT_KINDS, productKindLabel, productStatusLabel, stockTrackedLabel } from '../../interfaces/products.models';

type PageState = 'loading' | 'empty' | 'success' | 'error';

@Component({
  selector: 'app-products-list',
  templateUrl: './products-list.page.html',
  styleUrl: './products-list.page.scss',
  imports: [InventoryConfirmationDialogComponent, RouterLink, ReactiveFormsModule, CatalogHeaderComponent, FilterDialogComponent, IonIcon],
})
export class ProductsListPage {
  readonly kinds = PRODUCT_KINDS;
  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    kind: new FormControl<ProductKind | ''>('', { nonNullable: true }),
    status: new FormControl<ProductStatus | ''>('', { nonNullable: true }),
  });
  private readonly appliedFilters = signal(this.filters.getRawValue());
  readonly activeFilterCount = computed(() => Number(Boolean(this.appliedFilters().kind)) + Number(Boolean(this.appliedFilters().status)));
  private loadVersion = 0;
  private readonly api = inject(ProductsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly state = signal<PageState>('loading');
  readonly products = signal<Product[]>([]);
  readonly meta = signal<PaginatedProducts['meta'] | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly statusSaving = signal(false);
  readonly pendingStatusProduct = signal<Product | null>(null);
  readonly pendingStatusTarget = signal<ProductStatus | null>(null);
  readonly statusError = signal<string | null>(null);
  @ViewChild(InventoryConfirmationDialogComponent) private statusDialog!: InventoryConfirmationDialogComponent;
  @ViewChild(FilterDialogComponent, { static: true }) private filterDialog!: FilterDialogComponent;
  @ViewChild('productsHeading', { static: true }) private productsHeading!: ElementRef<HTMLElement>;

  constructor() {
    addIcons({ funnelOutline, searchOutline });
    this.filters.controls.search.valueChanges.pipe(
      debounceTime(250), takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => { void this.searchProducts(); });
    if (this.router.getCurrentNavigation()?.extras.state?.['productUpdated'] === true) {
      this.success.set('Producto actualizado.');
    }
    void this.load();
  }

  async load(page = 1): Promise<void> {
    const version = ++this.loadVersion;
    this.state.set('loading');
    this.error.set(null);
    try {
      const filters = this.appliedFilters();
      const response = await firstValueFrom(this.api.list(page, {
        search: filters.search.trim() || undefined,
        kind: filters.kind || undefined,
        status: filters.status || undefined,
      }));
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.products.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch {
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.state.set('error');
      this.error.set('No se pudieron cargar los productos. Intentá nuevamente.');
    }
  }

  clearFilters(): void {
    this.filters.reset(undefined, { emitEvent: false });
    void this.applyFilters();
  }

  openFilters(trigger: HTMLElement): void {
    void this.searchProducts();
    const applied = this.appliedFilters();
    this.filters.patchValue({ kind: applied.kind, status: applied.status });
    this.filterDialog.open(trigger);
  }

  clearDraftFilters(): void {
    this.filters.patchValue({ kind: '', status: '' });
  }

  async applyFilters(): Promise<void> {
    this.appliedFilters.set({ ...this.filters.getRawValue(), search: this.filters.controls.search.value.trim() });
    this.filterDialog.close();
    await this.load();
  }

  async searchProducts(): Promise<void> {
    const applied = this.appliedFilters();
    if (this.filters.controls.search.value.trim() === applied.search && this.state() !== 'error') return;
    this.filters.patchValue({ kind: applied.kind, status: applied.status });
    await this.applyFilters();
  }

  kindLabel = productKindLabel;
  unitLabel = baseUnitLabel;
  statusLabel = productStatusLabel;
  stockTrackedLabel = stockTrackedLabel;

  editPath(product: Product): string {
    return `/administracion/inventario/existencias/productos/${encodeURIComponent(String(product.id))}/editar`;
  }

  requestStatusChange(event: Event, product: Product, status: ProductStatus): void {
    if (this.statusSaving() || !this.canSetStatus(product, status)) return;
    this.pendingStatusProduct.set(product);
    this.pendingStatusTarget.set(status);
    this.statusError.set(null);
    this.statusDialog.open(event.currentTarget as HTMLElement | null);
  }

  canSetStatus(product: Product, status: ProductStatus): boolean {
    return status === 'active' ? product.capabilities.activate : product.capabilities.deactivate;
  }

  dismissStatusChange(): void {
    this.pendingStatusProduct.set(null);
    this.pendingStatusTarget.set(null);
    this.statusError.set(null);
  }

  async changeStatus(): Promise<void> {
    const product = this.pendingStatusProduct();
    const target = this.pendingStatusTarget();
    if (!product || !target || !this.canSetStatus(product, target) || this.statusSaving()) return;

    this.statusSaving.set(true);
    this.statusError.set(null);
    this.success.set(null);
    try {
      const response = await firstValueFrom(this.api.setStatus(product.id, target));
      this.products.update((items) => items.map((item) => item.id === response.data.id ? response.data : item));
      this.statusDialog.close();
      this.pendingStatusProduct.set(null);
      this.pendingStatusTarget.set(null);
      this.success.set(target === 'active' ? 'Producto activado.' : 'Producto desactivado.');
      await this.load(this.meta()?.current_page ?? 1);
      this.productsHeading.nativeElement.focus();
    } catch {
      this.statusError.set('No se pudo cambiar el estado del producto. Revisa los datos o intenta nuevamente.');
    } finally {
      this.statusSaving.set(false);
    }
  }
}
