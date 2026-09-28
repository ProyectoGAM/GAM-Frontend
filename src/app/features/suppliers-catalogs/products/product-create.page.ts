import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ProductsApi } from './products.api';
import { BASE_UNITS, PRODUCT_KINDS, BaseUnit, ProductInput, ProductKind } from './products.models';

const PRODUCTS_PATH = '/administracion/proveedores/productos';

export function safeReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')
    || /^[a-z][a-z\d+.-]*:/i.test(value)
    || /[\\\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  return value;
}

@Component({
  selector: 'app-product-create',
  templateUrl: './product-create.page.html',
  styleUrl: './product-create.page.scss',
  imports: [ReactiveFormsModule],
})
export class ProductCreatePage {
  private readonly api = inject(ProductsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly kinds = PRODUCT_KINDS;
  readonly units = BASE_UNITS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = new FormGroup({
    sku: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }),
    kind: new FormControl<ProductKind | ''>('', { nonNullable: true, validators: [Validators.required] }),
    base_unit: new FormControl<BaseUnit | ''>('', { nonNullable: true, validators: [Validators.required] }),
    stock_tracked: new FormControl(true, { nonNullable: true }),
  });

  kindChanged(): void {
    if (this.form.controls.kind.value === 'raw_material') {
      this.form.controls.base_unit.setValue('g');
      this.form.controls.base_unit.disable({ emitEvent: false });
      this.form.controls.stock_tracked.setValue(true);
      this.form.controls.stock_tracked.disable({ emitEvent: false });
      return;
    }
    this.form.controls.base_unit.enable({ emitEvent: false });
    this.form.controls.stock_tracked.enable({ emitEvent: false });
  }

  fieldError(control: AbstractControl): string | null {
    const serverError = control.getError('server');
    if (typeof serverError === 'string') return serverError;
    if (control.touched && control.hasError('required')) return 'Completa este campo.';
    if (control.touched && control.hasError('maxlength')) return 'El valor supera el máximo permitido.';
    return null;
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.saving.set(true);
    const value = this.form.getRawValue();
    const body: ProductInput = {
      sku: value.sku.trim(),
      name: value.name.trim(),
      kind: value.kind as ProductKind,
      base_unit: value.base_unit as BaseUnit,
      stock_tracked: value.stock_tracked,
    };
    try {
      await firstValueFrom(this.api.create(body));
      await this.router.navigateByUrl(this.returnPath());
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.applyValidationErrors(error);
        this.error.set('Revisa los datos ingresados.');
      } else {
        this.error.set('No se pudo guardar el producto. Intentá nuevamente.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void { void this.router.navigateByUrl(this.returnPath()); }

  private returnPath(): string {
    return safeReturnTo(this.route.snapshot.queryParamMap.get('returnTo')) ?? PRODUCTS_PATH;
  }

  private applyValidationErrors(error: HttpErrorResponse): void {
    const problem = typeof error.error === 'object' && error.error !== null
      ? error.error as { errors?: Record<string, unknown> }
      : {};
    for (const [field, errors] of Object.entries(problem.errors ?? {})) {
      const control = this.form.get(field);
      const message = Array.isArray(errors) ? errors.filter((item): item is string => typeof item === 'string').join(' ') : '';
      if (control && message) control.setErrors({ ...(control.errors ?? {}), server: message });
    }
  }
}
