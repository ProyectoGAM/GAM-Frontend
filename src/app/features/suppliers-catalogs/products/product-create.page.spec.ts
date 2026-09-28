import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ProductsApi } from './products.api';
import { Product } from './products.models';
import { ProductCreatePage, safeReturnTo } from './product-create.page';

const product: Product = {
  id: 17,
  sku: 'AL-17',
  name: 'Alimento inicial',
  kind: 'raw_material',
  base_unit: 'g',
  stock_tracked: true,
  status: 'active',
  system_managed: false,
  specialized_owner: null,
  capabilities: { editable_fields: [], activate: false, deactivate: false },
};

const createFixture = (create: ReturnType<typeof vi.fn>, returnTo: string | null = null) => {
  const navigateByUrl = vi.fn().mockResolvedValue(true);
  const fixture = TestBed.configureTestingModule({
    imports: [ProductCreatePage],
    providers: [
      { provide: ProductsApi, useValue: { create } },
      { provide: Router, useValue: { navigateByUrl } },
      { provide: ActivatedRoute, useValue: {
        snapshot: { queryParamMap: convertToParamMap(returnTo === null ? {} : { returnTo }) },
      } },
    ],
  }).createComponent(ProductCreatePage);
  fixture.detectChanges();
  return { fixture, navigateByUrl };
};

describe('Product create page', () => {
  it('forces raw material to grams and tracked stock in the submitted payload', async () => {
    const create = vi.fn().mockReturnValue(of({ data: product }));
    const { fixture, navigateByUrl } = createFixture(create, '/administracion/inventario/existencias');
    const page = fixture.componentInstance;
    expect(page.form.controls.stock_tracked.value).toBe(true);
    page.form.patchValue({ sku: 'AL-17', name: 'Alimento inicial' });
    const kind = fixture.nativeElement.querySelector('#product-kind') as HTMLSelectElement;
    kind.value = 'raw_material';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(page.form.controls.base_unit.value).toBe('g');
    expect(page.form.controls.stock_tracked.value).toBe(true);
    expect(page.form.controls.base_unit.disabled).toBe(true);
    expect(page.form.controls.stock_tracked.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Guardar producto');
    expect(fixture.nativeElement.textContent).toContain('Cancelar');

    await page.submit();
    expect(create).toHaveBeenCalledWith({
      sku: 'AL-17', name: 'Alimento inicial', kind: 'raw_material', base_unit: 'g', stock_tracked: true,
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/inventario/existencias');
    fixture.destroy();
  });

  it('shows Laravel SKU validation beside that field with matching ARIA attributes', async () => {
    const create = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { sku: ['Ese código ya existe.'] } },
    })));
    const { fixture } = createFixture(create);
    const page = fixture.componentInstance;
    page.form.setValue({ sku: 'AL-17', name: 'Alimento inicial', kind: 'supply', base_unit: 'kg', stock_tracked: true });

    await page.submit();
    fixture.detectChanges();
    const sku = fixture.nativeElement.querySelector('#product-sku') as HTMLInputElement;
    expect(fixture.nativeElement.querySelector('#sku-error')?.textContent).toContain('Ese código ya existe.');
    expect(sku.getAttribute('aria-invalid')).toBe('true');
    expect(sku.getAttribute('aria-describedby')).toBe('sku-error');
    fixture.destroy();
  });

  it('associates stock tracking validation with the checkbox', async () => {
    const create = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { stock_tracked: ['Seleccioná si el producto controla stock.'] } },
    })));
    const { fixture } = createFixture(create);
    const page = fixture.componentInstance;
    page.form.setValue({ sku: 'AL-17', name: 'Alimento inicial', kind: 'supply', base_unit: 'kg', stock_tracked: false });

    await page.submit();
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector('#product-stock-tracked') as HTMLInputElement;
    expect(fixture.nativeElement.querySelector('#stock-tracked-error')?.textContent).toContain('Seleccioná si el producto controla stock.');
    expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    expect(checkbox.getAttribute('aria-describedby')).toBe('stock-tracked-error');
    fixture.destroy();
  });

  it('uses a generic Spanish error and hides raw server details for non-validation failures', async () => {
    const create = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 500,
      error: { message: 'SQL constraint products_private_table' },
    })));
    const { fixture } = createFixture(create);
    const page = fixture.componentInstance;
    page.form.setValue({ sku: 'AL-17', name: 'Alimento inicial', kind: 'supply', base_unit: 'kg', stock_tracked: true });

    await page.submit();
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('No se pudo guardar el producto. Intentá nuevamente.');
    expect(content).not.toContain('SQL constraint products_private_table');
    fixture.destroy();
  });

  it('falls back to the Products list after success when returnTo is unsafe', async () => {
    const create = vi.fn().mockReturnValue(of({ data: product }));
    const { fixture, navigateByUrl } = createFixture(create, '//evil.example');
    const page = fixture.componentInstance;
    page.form.setValue({ sku: 'AL-17', name: 'Alimento inicial', kind: 'supply', base_unit: 'kg', stock_tracked: true });

    await page.submit();
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/proveedores/productos');
    fixture.destroy();
  });

  it('uses a valid returnTo path when cancelling', () => {
    const { fixture, navigateByUrl } = createFixture(vi.fn(), '/administracion/inventario/existencias');

    fixture.componentInstance.cancel();
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/inventario/existencias');
    fixture.destroy();
  });

  it('rejects schemes, protocol-relative paths, backslashes, and control characters in returnTo', () => {
    const backslashPath = `/${String.fromCharCode(92)}evil.example`;
    const controlPath = `/products${String.fromCharCode(0)}bad`;
    for (const value of ['https://evil.example', '//evil.example', backslashPath, controlPath]) {
      expect(safeReturnTo(value)).toBeNull();
    }
    expect(safeReturnTo('/administracion/inventario/existencias')).toBe('/administracion/inventario/existencias');
  });
});
