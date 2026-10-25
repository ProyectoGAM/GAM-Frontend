import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CatalogHeaderComponent } from '../../components/catalog-header/catalog-header.component';

import { InventoryConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { ProductsApi } from '../../services/products.api';
import { baseUnitLabel, PaginatedProducts, Product, ProductStatus, ProductKind, PRODUCT_KINDS, productKindLabel, productStatusLabel, stockTrackedLabel } from '../../interfaces/products.models';

type PageState = 'loading' | 'empty' | 'success' | 'error';

@Component({
  selector: 'app-products-list',
  templateUrl: './products-list.page.html',
  styleUrl: './products-list.page.scss',
  imports: [InventoryConfirmationDialogComponent, RouterLink, ReactiveFormsModule, CatalogHeaderComponent],
})
export class ProductsListPage {
  readonly kinds = PRODUCT_KINDS;
  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    kind: new FormControl<ProductKind | ''>('', { nonNullable: true }),
    status: new FormControl<ProductStatus | ''>('', { nonNullable: true }),
  });
  private loadVersion = 0;
  private readonly api = inject(ProductsApi);
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
  @ViewChild('productsHeading', { static: true }) private productsHeading!: ElementRef<HTMLElement>;

  constructor() {
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
      const filters = this.filters.getRawValue();
      const response = await firstValueFrom(this.api.list(page, {
        search: filters.search.trim() || undefined,
        kind: filters.kind || undefined,
        status: filters.status || undefined,
      }));
      if (version !== this.loadVersion) return;
      this.products.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch {
      if (version !== this.loadVersion) return;
      this.state.set('error');
      this.error.set('No se pudieron cargar los productos. Intentá nuevamente.');
    }
  }

  clearFilters(): void {
    this.filters.reset();
    void this.load();
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
