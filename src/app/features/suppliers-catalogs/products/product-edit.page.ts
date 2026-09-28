import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ProductsApi } from './products.api';
import { BASE_UNITS, PRODUCT_KINDS, BaseUnit, Product, ProductEditableField, ProductInput, ProductKind } from './products.models';

type PageState = 'loading' | 'success' | 'error';
const PRODUCTS_PATH = '/administracion/proveedores/productos';
const EDITABLE_FIELDS: readonly ProductEditableField[] = ['sku', 'name', 'kind', 'base_unit', 'stock_tracked'];

@Component({
  selector: 'app-product-edit',
  templateUrl: './product-edit.page.html',
  styleUrl: './product-edit.page.scss',
  imports: [ReactiveFormsModule, RouterLink],
})
export class ProductEditPage {
  private readonly api = inject(ProductsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productId = this.route.snapshot.paramMap.get('id');

  readonly kinds = PRODUCT_KINDS;
  readonly units = BASE_UNITS;
  readonly state = signal<PageState>('loading');
  readonly product = signal<Product | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = new FormGroup({
    sku: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }),
    kind: new FormControl<ProductKind | ''>('', { nonNullable: true, validators: [Validators.required] }),
    base_unit: new FormControl<BaseUnit | ''>('', { nonNullable: true, validators: [Validators.required] }),
    stock_tracked: new FormControl(false, { nonNullable: true }),
  });

  constructor() { void this.load(); }

  async load(): Promise<void> {
    if (!this.productId) {
      this.state.set('error');
      this.error.set('No se pudo identificar el producto. Volvé al listado e intentá nuevamente.');
      return;
    }

    this.state.set('loading');
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.get(this.productId));
      const product = response.data;
      this.product.set(product);
      this.form.reset({
        sku: product.sku,
        name: product.name,
        kind: product.kind,
        base_unit: product.base_unit,
        stock_tracked: product.stock_tracked,
      });
      for (const field of EDITABLE_FIELDS) {
        const control = this.form.controls[field];
        if (product.capabilities.editable_fields.includes(field)) control.enable({ emitEvent: false });
        else control.disable({ emitEvent: false });
      }
      this.state.set('success');
    } catch (error) {
      this.state.set('error');
      this.error.set(this.loadErrorMessage(error));
    }
  }

  isEditable(field: ProductEditableField): boolean {
    return this.product()?.capabilities.editable_fields.includes(field) ?? false;
  }

  updateBody(): Partial<ProductInput> {
    const original = this.product();
    if (!original) return {};
    const value = this.form.getRawValue();
    const body: Partial<ProductInput> = {};
    const allowed = original.capabilities.editable_fields;

    if (allowed.includes('sku') && value.sku.trim() !== original.sku) body.sku = value.sku.trim();
    if (allowed.includes('name') && value.name.trim() !== original.name) body.name = value.name.trim();
    if (allowed.includes('kind') && value.kind && value.kind !== original.kind) body.kind = value.kind;
    if (allowed.includes('base_unit') && value.base_unit && value.base_unit !== original.base_unit) body.base_unit = value.base_unit;
    if (allowed.includes('stock_tracked') && value.stock_tracked !== original.stock_tracked) body.stock_tracked = value.stock_tracked;
    return body;
  }

  hasChanges(): boolean { return Object.keys(this.updateBody()).length > 0; }

  fieldError(control: AbstractControl): string | null {
    const server = control.getError('server');
    if (typeof server === 'string') return server;
    if (control.touched && control.hasError('required')) return 'Completa este campo.';
    if (control.touched && control.hasError('maxlength')) return 'El valor supera el máximo permitido.';
    return null;
  }

  clearFieldError(control: AbstractControl): void {
    this.error.set(null);
    const errors = control.errors;
    if (!errors || !Object.hasOwn(errors, 'server')) return;
    const next = { ...errors };
    delete next['server'];
    control.setErrors(Object.keys(next).length ? next : null);
  }

  async submit(): Promise<void> {
    const product = this.product();
    if (!product || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body = this.updateBody();
    if (!Object.keys(body).length) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.update(product.id, body));
      await this.router.navigateByUrl(PRODUCTS_PATH, { state: { productUpdated: true } });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.applyValidationErrors(error);
        this.error.set('Revisa los datos ingresados.');
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        this.error.set('No se pudo actualizar el producto por un conflicto con los datos actuales. Revisa los cambios e intentá nuevamente.');
      } else {
        this.error.set(this.mutationErrorMessage(error));
      }
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    if (!this.saving()) void this.router.navigateByUrl(PRODUCTS_PATH);
  }

  private loadErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 403) return 'No tenés permiso para consultar este producto.';
    if (error instanceof HttpErrorResponse && error.status === 404) return 'No se encontró el producto.';
    return 'No se pudieron cargar los datos del producto. Intentá nuevamente.';
  }

  private mutationErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 403) return 'No tenés permiso para actualizar este producto.';
    if (error instanceof HttpErrorResponse && error.status === 404) return 'El producto ya no está disponible. Volvé al listado.';
    return 'No se pudo guardar el producto. Comprueba tu conexión e intentá nuevamente.';
  }

  private applyValidationErrors(error: HttpErrorResponse): void {
    const problem = typeof error.error === 'object' && error.error !== null
      ? error.error as { errors?: Record<string, unknown> }
      : {};
    for (const field of EDITABLE_FIELDS) {
      const errors = problem.errors?.[field];
      if (!Array.isArray(errors)) continue;
      const message = errors.filter((item): item is string => typeof item === 'string').join(' ');
      if (!message) continue;
      const control = this.form.controls[field];
      control.setErrors({ ...(control.errors ?? {}), server: message });
      control.markAsTouched();
    }
  }
}
