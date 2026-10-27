import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, DestroyRef, ElementRef, HostListener, Injector, computed, effect, inject, signal, viewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, checkmarkOutline, cubeOutline, globeOutline, informationCircleOutline, layersOutline, lockClosedOutline } from 'ionicons/icons';

import { InventoryConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { ProductsApi } from '../../services/products.api';
import { BASE_UNITS, CREATABLE_PRODUCT_KINDS, BaseUnit, CreateProductInput, CreatableProductKind, Product, isCreatableProductKind } from '../../interfaces/products.models';

const PRODUCTS_PATH = '/administracion/inventario/existencias/productos';

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
  imports: [ReactiveFormsModule, IonIcon, InventoryConfirmationDialogComponent],
  host: { '[style.--product-keyboard-offset]': 'viewportBottom() + "px"' },
})
export class ProductCreatePage {
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly productForm = viewChild<ElementRef<HTMLFormElement>>('productForm');
  private readonly discardDialog = viewChild.required(InventoryConfirmationDialogComponent);
  private pendingLeave: Promise<boolean> | null = null;
  private resolveLeave: ((leave: boolean) => void) | null = null;
  readonly viewportBottom = signal(0);
  readonly createdProduct = signal<Product | null>(null);
  private readonly createdHeading = viewChild<ElementRef<HTMLElement>>('createdHeading');
  readonly canRegisterReceipt = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.move') === true);
  private readonly api = inject(ProductsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly kinds = CREATABLE_PRODUCT_KINDS;
  readonly units = BASE_UNITS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = new FormGroup({
    sku: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }),
    kind: new FormControl<CreatableProductKind | ''>('', { nonNullable: true, validators: [Validators.required,
      (control) => !control.value || isCreatableProductKind(control.value) ? null : { unavailableKind: true }] }),
    base_unit: new FormControl<BaseUnit | ''>('', { nonNullable: true, validators: [Validators.required] }),
    stock_tracked: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    addIcons({ arrowBackOutline, checkmarkOutline, cubeOutline, globeOutline, informationCircleOutline, layersOutline, lockClosedOutline });
    effect(() => this.createdHeading()?.nativeElement.focus());
    const viewport = window.visualViewport;
    const updateViewport = () => this.viewportBottom.set(viewport && viewport.scale === 1
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0);
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    updateViewport();
    this.destroyRef.onDestroy(() => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      this.resolveLeave?.(false);
    });
  }

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
    if (control.hasError('unavailableKind')) return 'Elegí un tipo disponible. Las raciones se gestionan desde recetas y stock de raciones.';
    return null;
  }

  async submit(): Promise<void> {
    if (this.saving() || this.createdProduct()) return;
    this.form.controls.name.setValue(this.form.controls.name.value.trim());
    this.form.controls.sku.setValue(this.form.controls.sku.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusError();
      return;
    }

    this.error.set(null);
    this.saving.set(true);
    const value = this.form.getRawValue();
    const body: CreateProductInput = {
      sku: value.sku.trim(),
      name: value.name.trim(),
      kind: value.kind as CreatableProductKind,
      base_unit: value.base_unit as BaseUnit,
      stock_tracked: value.stock_tracked,
    };
    try {
      const response = await firstValueFrom(this.api.create(body));
      this.createdProduct.set(response.data);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.applyValidationErrors(error);
        this.error.set('Revisa los datos ingresados.');
      } else {
        this.error.set('No se pudo guardar el producto. Intentá nuevamente.');
      }
      this.focusError();
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void { if (!this.saving()) void this.router.navigateByUrl(this.returnPath()); }

  canLeave(): boolean | Promise<boolean> {
    if (!this.auth.user()) return true;
    if (this.saving()) return false;
    if (!this.hasUnsavedChanges()) return true;
    if (this.pendingLeave) return this.pendingLeave;
    this.pendingLeave = new Promise<boolean>((resolve) => { this.resolveLeave = resolve; });
    this.discardDialog().open();
    return this.pendingLeave;
  }

  finishLeave(leave: boolean): void {
    this.discardDialog().close();
    this.resolveLeave?.(leave);
    this.resolveLeave = null;
    this.pendingLeave = null;
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.auth.user() && (this.saving() || this.hasUnsavedChanges())) {
      event.preventDefault(); event.returnValue = '';
    }
  }

  private hasUnsavedChanges(): boolean {
    if (this.createdProduct()) return false;
    const value = this.form.getRawValue();
    return Boolean(value.name || value.sku || value.kind || value.base_unit || !value.stock_tracked);
  }

  private focusError(): void {
    afterNextRender(() => {
      const target = this.productForm()?.nativeElement.querySelector<HTMLElement>(
        'input.ng-invalid:not(:disabled), select.ng-invalid:not(:disabled)',
      ) ?? this.productForm()?.nativeElement.querySelector<HTMLElement>('[role="alert"]');
      target?.focus();
      target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, { injector: this.injector });
  }

  registerReceipt(): void {
    const product = this.createdProduct();
    if (!product || !this.canRegisterReceipt()) return;
    void this.router.navigateByUrl(`/administracion/inventario/ajustes-y-perdidas?product_id=${product.id}`);
  }

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
