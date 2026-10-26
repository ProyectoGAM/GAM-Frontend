import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';

import { ProductsApi } from '../../services/products.api';
import { Product } from '../../interfaces/products.models';
import { ProductCreatePage, safeReturnTo } from './product-create.page';
import { stubNativeDialog } from '../../testing/native-dialog-test';

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
      { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['inventory.move'] }) } },
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
  let restoreDialog: () => void;
  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => restoreDialog());

  it('does not offer ration as a type for new products', () => {
    const { fixture } = createFixture(vi.fn());
    const select = fixture.nativeElement.querySelector('#product-kind') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).not.toContain('finished_feed');
    expect(Array.from(select.options).map((option) => option.value)).toContain('raw_material');
    fixture.destroy();
  });

  it('rejects a retired kind even if an obsolete option is submitted', async () => {
    const create = vi.fn(); const { fixture } = createFixture(create);
    const page = fixture.componentInstance;
    page.form.patchValue({ name: 'Ración anterior', sku: 'RACION-OLD', base_unit: 'kg' });
    const select = fixture.nativeElement.querySelector('#product-kind') as HTMLSelectElement;
    select.add(new Option('Ración', 'finished_feed')); select.value = 'finished_feed';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await page.submit(); fixture.detectChanges();
    expect(create).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Las raciones se gestionan desde recetas');
    fixture.destroy();
  });
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
    expect(fixture.nativeElement.textContent).toContain('Crear producto');
    expect(fixture.nativeElement.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.close-button')).toBeNull();

    await page.submit();
    expect(create).toHaveBeenCalledWith({
      sku: 'AL-17', name: 'Alimento inicial', kind: 'raw_material', base_unit: 'g', stock_tracked: true,
    });
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(page.createdProduct()?.id).toBe(product.id);
    page.registerReceipt();
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/inventario/ajustes-y-perdidas?product_id=17');
    await page.submit();
    expect(create).toHaveBeenCalledTimes(1);
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

  it('offers the catalog after success when returnTo is unsafe', async () => {
    const create = vi.fn().mockReturnValue(of({ data: product }));
    const { fixture, navigateByUrl } = createFixture(create, '//evil.example');
    const page = fixture.componentInstance;
    page.form.setValue({ sku: 'AL-17', name: 'Alimento inicial', kind: 'supply', base_unit: 'kg', stock_tracked: true });

    await page.submit();
    fixture.componentInstance.cancel();
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/inventario/existencias/productos');
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

  it('keeps leaving an untouched form immediate but protects edits and preserves them when dismissed', async () => {
    const { fixture } = createFixture(vi.fn());
    const page = fixture.componentInstance;
    expect(page.canLeave()).toBe(true);
    page.form.controls.name.setValue('Maíz en grano');
    const leaving = page.canLeave();
    expect(page.canLeave()).toBe(leaving);
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Seguir editando');
    (dialog.querySelector('button') as HTMLButtonElement).click();
    expect(await leaving).toBe(false);
    expect(page.form.controls.name.value).toBe('Maíz en grano');
    expect(dialog.open).toBe(false);
    const confirmed = page.canLeave();
    (dialog.querySelector('.danger') as HTMLButtonElement).click();
    expect(await confirmed).toBe(true);
    fixture.destroy();
  });

  it('does not ask to discard when edits have been cleared or creation succeeded', async () => {
    const { fixture } = createFixture(vi.fn().mockReturnValue(of({ data: product })));
    const page = fixture.componentInstance;
    page.form.controls.name.setValue('Temporal'); page.form.controls.name.setValue('');
    expect(page.canLeave()).toBe(true);
    page.form.setValue({ sku: 'AL-17', name: 'Alimento inicial', kind: 'supply', base_unit: 'kg', stock_tracked: true });
    await page.submit(); expect(page.canLeave()).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.create-bar')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Registrar ingreso');
    fixture.destroy();
  });

  it('prevents leaving or repeated creation while pending, and disables editing in the form', async () => {
    const pending = new Subject<{ data: Product }>(); const create = vi.fn().mockReturnValue(pending);
    const { fixture, navigateByUrl } = createFixture(create); const page = fixture.componentInstance;
    page.form.setValue({ sku: 'AL-17', name: 'Alimento inicial', kind: 'supply', base_unit: 'kg', stock_tracked: true });
    const saving = page.submit(); await page.submit(); page.cancel(); fixture.detectChanges();
    expect(page.canLeave()).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect((fixture.nativeElement.querySelector('.create-button') as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Creando…');
    pending.next({ data: product }); pending.complete(); await saving; fixture.destroy();
  });

  it('submits from the actual form, keeps invalid submit enabled and focuses the first missing field', async () => {
    const create = vi.fn(); const { fixture } = createFixture(create);
    const button = fixture.nativeElement.querySelector('.create-button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('form').dispatchEvent(submit);
    await fixture.whenStable(); fixture.detectChanges();
    expect(submit.defaultPrevented).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#product-name'));
    expect(fixture.nativeElement.querySelector('#name-error').textContent).toContain('Completa este campo.');
    fixture.destroy();
  });

  it('focuses a rejected SKU and retains all entered values for correction', async () => {
    const { fixture } = createFixture(vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422, error: { errors: { sku: ['Ese código ya existe.'] } },
    }))));
    const page = fixture.componentInstance;
    page.form.setValue({ sku: 'AL-17', name: 'Maíz', kind: 'supply', base_unit: 'kg', stock_tracked: true });
    await page.submit(); await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#product-sku'));
    expect(page.form.controls.name.value).toBe('Maíz');
    fixture.destroy();
  });

  it('restores selectable stock settings when changing away from raw material', () => {
    const { fixture } = createFixture(vi.fn()); const page = fixture.componentInstance;
    page.form.controls.kind.setValue('raw_material'); page.kindChanged();
    page.form.controls.kind.setValue('supply'); page.kindChanged();
    expect(page.form.controls.base_unit.enabled).toBe(true);
    expect(page.form.controls.stock_tracked.enabled).toBe(true);
    fixture.destroy();
  });

  it('protects browser reload only when unsaved data exists', () => {
    const { fixture } = createFixture(vi.fn()); const page = fixture.componentInstance;
    const clean = new Event('beforeunload', { cancelable: true });
    page.beforeUnload(clean as BeforeUnloadEvent); expect(clean.defaultPrevented).toBe(false);
    page.form.controls.sku.setValue('MAIZ-001');
    const edited = new Event('beforeunload', { cancelable: true });
    page.beforeUnload(edited as BeforeUnloadEvent); expect(edited.defaultPrevented).toBe(true);
    fixture.destroy();
  });

  it('tracks keyboard viewport changes and removes its listeners on destroy', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const viewport = Object.assign(new EventTarget(), { scale: 1, height: window.innerHeight - 300, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    try {
      const { fixture } = createFixture(vi.fn()); const page = fixture.componentInstance;
      expect(page.viewportBottom()).toBe(300);
      viewport.height = window.innerHeight; viewport.dispatchEvent(new Event('resize'));
      expect(page.viewportBottom()).toBe(0);
      fixture.destroy(); viewport.height = 10; viewport.dispatchEvent(new Event('resize'));
      expect(page.viewportBottom()).toBe(0);
    } finally {
      if (descriptor) Object.defineProperty(window, 'visualViewport', descriptor);
      else Reflect.deleteProperty(window, 'visualViewport');
    }
  });
});
