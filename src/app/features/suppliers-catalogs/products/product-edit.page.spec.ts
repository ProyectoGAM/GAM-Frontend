import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ProductsApi } from './products.api';
import { Product } from './products.models';
import { ProductEditPage } from './product-edit.page';

const product: Product = {
  id: 17,
  sku: 'AL-17',
  name: 'Alimento inicial',
  kind: 'supply',
  base_unit: 'kg',
  stock_tracked: true,
  status: 'active',
  system_managed: false,
  specialized_owner: null,
  capabilities: { editable_fields: ['name'], activate: false, deactivate: false },
};

const createFixture = (options: {
  get?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
} = {}) => {
  const get = options.get ?? vi.fn().mockReturnValue(of({ data: product }));
  const update = options.update ?? vi.fn().mockReturnValue(of({ data: product }));
  const fixture = TestBed.configureTestingModule({
    imports: [ProductEditPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: String(product.id) }) } } },
      { provide: ProductsApi, useValue: { get, update } },
    ],
  }).createComponent(ProductEditPage);
  fixture.detectChanges();
  const router = TestBed.inject(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { fixture, get, update, navigateByUrl };
};

const settle = async (fixture: ReturnType<typeof createFixture>['fixture']): Promise<void> => {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
};

describe('Product edit page', () => {
  it('loads detail using the route ID and shows allowed and read-only fields', async () => {
    const { fixture, get } = createFixture();
    await settle(fixture);

    expect(get).toHaveBeenCalledExactlyOnceWith(String(product.id));
    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      sku: product.sku,
      name: product.name,
      kind: product.kind,
      base_unit: product.base_unit,
      stock_tracked: product.stock_tracked,
    });
    expect(fixture.componentInstance.form.controls.name.enabled).toBe(true);
    expect(fixture.componentInstance.form.controls.sku.disabled).toBe(true);
    expect(fixture.componentInstance.form.controls.kind.disabled).toBe(true);
    expect(fixture.componentInstance.form.controls.base_unit.disabled).toBe(true);
    expect(fixture.componentInstance.form.controls.stock_tracked.disabled).toBe(true);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#product-sku')?.hasAttribute('readonly')).toBe(true);
    expect(element.querySelector('#product-kind')?.hasAttribute('disabled')).toBe(true);
    expect(element.textContent).toContain('Unidad base');
    fixture.destroy();
  });

  it('patches only changed fields that capabilities allow and returns to the list', async () => {
    const { fixture, update, navigateByUrl } = createFixture();
    await settle(fixture);
    fixture.componentInstance.form.controls.name.setValue('  Alimento actualizado  ');
    fixture.componentInstance.form.controls.sku.setValue('IGNORAR-SKU');
    await fixture.componentInstance.submit();

    expect(update).toHaveBeenCalledExactlyOnceWith(product.id, { name: 'Alimento actualizado' });
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/proveedores/productos', {
      state: { productUpdated: true },
    });
    fixture.destroy();
  });

  it('does not send an empty PATCH and keeps Save disabled until an allowed value changes', async () => {
    const { fixture, update } = createFixture();
    await settle(fixture);

    expect(fixture.componentInstance.hasChanges()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);
    await fixture.componentInstance.submit();
    expect(update).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('cancel returns to the list without an API request', async () => {
    const { fixture, update, navigateByUrl } = createFixture();
    await settle(fixture);
    fixture.componentInstance.cancel();

    expect(update).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/administracion/proveedores/productos');
    fixture.destroy();
  });

  it('shows a 422 field error beside its field', async () => {
    const update = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { name: ['El nombre ya está registrado.'] } },
    })));
    const { fixture } = createFixture({ update });
    await settle(fixture);
    fixture.componentInstance.form.controls.name.setValue('Nombre repetido');
    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('El nombre ya está registrado.');
    expect(fixture.nativeElement.textContent).toContain('Nombre');
    fixture.destroy();
  });

  it('shows a human conflict for 409 and permits retry without exposing technical details', async () => {
    const update = vi.fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({
        status: 409,
        error: { detail: 'SQLSTATE private_table product_id' },
      })))
      .mockReturnValueOnce(of({ data: { ...product, name: 'Alimento nuevo' } }));
    const { fixture, navigateByUrl } = createFixture({ update });
    await settle(fixture);
    fixture.componentInstance.form.controls.name.setValue('Alimento nuevo');
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('conflicto con los datos actuales');
    expect(fixture.nativeElement.textContent).not.toContain('SQLSTATE');

    await fixture.componentInstance.submit();
    expect(update).toHaveBeenCalledTimes(2);
    expect(navigateByUrl).toHaveBeenCalled();
    fixture.destroy();
  });

  it('renders a safe permission message for detail failures', async () => {
    const forbidden = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403, error: 'Forbidden' })));
    const { fixture } = createFixture({ get: forbidden });
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('No tenés permiso para consultar este producto.');
    expect(fixture.nativeElement.textContent).not.toContain('403');
    fixture.destroy();
  });

  it('renders a safe not-found message for detail failures', async () => {
    const missing = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404, error: 'Not Found' })));
    const missingFixture = createFixture({ get: missing }).fixture;
    await settle(missingFixture);
    expect(missingFixture.nativeElement.textContent).toContain('No se encontró el producto.');
    expect(missingFixture.nativeElement.textContent).not.toContain('404');
    missingFixture.destroy();
  });
});
