import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ProductsApi } from './products.api';
import { Product } from './products.models';
import { ProductsListPage } from './products-list.page';
import { stubNativeDialog } from '../../inventory/testing/native-dialog-test';

const product: Product = {
  id: 987654,
  sku: 'AL-17',
  name: 'Ración inicial',
  kind: 'finished_feed',
  base_unit: 'kg',
  stock_tracked: true,
  status: 'active',
  system_managed: false,
  specialized_owner: null,
  capabilities: { editable_fields: ['sku', 'name', 'kind', 'base_unit', 'stock_tracked'], activate: false, deactivate: true },
};

const pageResponse = (data: Product[], currentPage = 1) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: currentPage, from: 1, last_page: 2, per_page: 25, to: data.length, total: 51 },
});

const settle = async (fixture: ReturnType<typeof createFixture>['fixture']): Promise<void> => {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
};

const createFixture = (options: {
  list?: ReturnType<typeof vi.fn>;
  setStatus?: ReturnType<typeof vi.fn>;
} = {}) => {
  const list = options.list ?? vi.fn().mockReturnValue(of(pageResponse([product])));
  const setStatus = options.setStatus ?? vi.fn().mockReturnValue(of({ data: product }));
  const fixture = TestBed.configureTestingModule({
    imports: [ProductsListPage],
    providers: [
      provideRouter([]),
      { provide: ProductsApi, useValue: { list, setStatus } },
    ],
  }).createComponent(ProductsListPage);
  fixture.detectChanges();
  return { fixture, list, setStatus };
};

describe('Products list page', () => {
  let restoreDialog: () => void;
  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => { restoreDialog(); document.body.innerHTML = ''; });

  it('renders localized product details without exposing enum codes or IDs', async () => {
    const { fixture } = createFixture();
    await settle(fixture);
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Ración');
    expect(content).toContain('Kilogramo');
    expect(content).toContain('Sí');
    expect(content).toContain('Activo');
    expect(content).not.toContain('finished_feed');
    expect(content).not.toContain('stock_tracked');
    expect(content).not.toContain('987654');
    expect(content).not.toContain('Eliminar');
    fixture.destroy();
  });

  it('requests pages from pagination metadata and keeps previous and next usable', async () => {
    const secondProduct = { ...product, id: 18, sku: 'AL-18', name: 'Ración crecimiento' };
    const list = vi.fn()
      .mockReturnValueOnce(of(pageResponse([product])))
      .mockReturnValueOnce(of(pageResponse([secondProduct], 2)))
      .mockReturnValueOnce(of(pageResponse([product])));
    const { fixture } = createFixture({ list });
    await settle(fixture);
    expect(list).toHaveBeenNthCalledWith(1, 1);
    const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.pagination button'));
    const next = buttons().find((button) => button.textContent?.trim() === 'Siguiente') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    next.click();
    await settle(fixture);
    expect(list).toHaveBeenNthCalledWith(2, 2);
    expect(fixture.nativeElement.textContent).toContain('Ración crecimiento');
    const previous = buttons().find((button) => button.textContent?.trim() === 'Anterior') as HTMLButtonElement;
    expect(previous.disabled).toBe(false);
    previous.click();
    await settle(fixture);
    expect(list).toHaveBeenNthCalledWith(3, 1);
    fixture.destroy();
  });

  it('keeps a vaccine-owned product in Products and follows its returned capabilities', async () => {
    const vaccineProduct: Product = {
      ...product,
      kind: 'vaccine',
      specialized_owner: { type: 'vaccine', id: '01J6M8F7Y2KV5P1R9WQ0T6Z3AB' },
    };
    const { fixture } = createFixture({ list: vi.fn().mockReturnValue(of(pageResponse([vaccineProduct]))) });
    await settle(fixture);
    const element = fixture.nativeElement as HTMLElement;
    const edit = element.querySelector('.row-actions a') as HTMLAnchorElement;
    expect(element.textContent).toContain('Vacuna');
    expect(edit.textContent).toContain('Editar');
    expect(edit.getAttribute('href')).toBe('/administracion/proveedores/productos/987654/editar');
    expect(element.textContent).toContain('Desactivar');
    expect(element.textContent).not.toContain('Gestionar vacuna');
    expect(element.innerHTML).not.toContain('/administracion/proveedores/vacunas');
    fixture.destroy();
  });

  it('keeps an unowned kind=vaccine as a normal product controlled by capabilities', async () => {
    const unownedVaccine: Product = { ...product, kind: 'vaccine', capabilities: { editable_fields: ['name'], activate: false, deactivate: true } };
    const { fixture } = createFixture({ list: vi.fn().mockReturnValue(of(pageResponse([unownedVaccine]))) });
    await settle(fixture);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Editar');
    expect(element.textContent).toContain('Desactivar');
    expect(element.textContent).not.toContain('Gestionar vacuna');
    fixture.destroy();
  });

  it('shows the egg stock owner destination and no Product mutations', async () => {
    const egg: Product = { ...product, system_managed: true, specialized_owner: { type: 'egg_stock' } };
    const { fixture } = createFixture({ list: vi.fn().mockReturnValue(of(pageResponse([egg]))) });
    await settle(fixture);
    const element = fixture.nativeElement as HTMLElement;
    const stockLink = element.querySelector('.row-actions a') as HTMLAnchorElement;
    expect(stockLink.textContent).toContain('Gestionado por Stock de huevos');
    expect(stockLink.getAttribute('href')).toBe('/administracion/inventario/existencias/huevos');
    expect(element.textContent).not.toContain('Editar');
    expect(element.textContent).not.toContain('Desactivar');
    fixture.destroy();
  });

  it('shows only the status action authorized for the current state and capabilities', async () => {
    const inactive: Product = { ...product, status: 'inactive', capabilities: { editable_fields: [], activate: true, deactivate: false } };
    const { fixture } = createFixture({ list: vi.fn().mockReturnValue(of(pageResponse([inactive]))) });
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Activar');
    expect(fixture.nativeElement.textContent).not.toContain('Desactivar');
    expect(fixture.nativeElement.textContent).not.toContain('Editar');
    fixture.destroy();
  });

  it('uses capabilities for action visibility and the requested target even when status disagrees', async () => {
    const inconsistent: Product = {
      ...product,
      status: 'active',
      capabilities: { editable_fields: [], activate: true, deactivate: false },
    };
    const setStatus = vi.fn().mockReturnValue(of({ data: inconsistent }));
    const { fixture } = createFixture({
      list: vi.fn().mockReturnValue(of(pageResponse([inconsistent]))),
      setStatus,
    });
    await settle(fixture);
    const element = fixture.nativeElement as HTMLElement;
    const actions = Array.from(element.querySelectorAll('.row-actions button')).map((button) => button.textContent?.trim());
    expect(actions).toEqual(['Activar']);
    expect(element.querySelector('.status')?.textContent).toContain('Activo');

    (element.querySelector('.row-actions button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.textContent).toContain('Activar producto');
    (dialog.querySelector('button.danger') as HTMLButtonElement).click();
    await settle(fixture);

    expect(setStatus).toHaveBeenCalledExactlyOnceWith(inconsistent.id, 'active');
    fixture.destroy();
  });

  it('canceling the status dialog makes no request', async () => {
    const setStatus = vi.fn().mockReturnValue(of({ data: { ...product, status: 'inactive' } }));
    const { fixture } = createFixture({ setStatus });
    await settle(fixture);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    (dialog.querySelector('button.secondary') as HTMLButtonElement).click();
    expect(dialog.open).toBe(false);
    expect(setStatus).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('confirms one exact status operation, refreshes the list and renders returned capabilities', async () => {
    const inactive: Product = { ...product, status: 'inactive', capabilities: { editable_fields: [], activate: true, deactivate: false } };
    const list = vi.fn().mockReturnValueOnce(of(pageResponse([product]))).mockReturnValueOnce(of(pageResponse([inactive])));
    const setStatus = vi.fn().mockReturnValue(of({ data: inactive }));
    const { fixture } = createFixture({ list, setStatus });
    await settle(fixture);
    const deactivate = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Desactivar') as HTMLButtonElement;
    deactivate.click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('button.danger') as HTMLButtonElement).click();
    await settle(fixture);

    expect(setStatus).toHaveBeenCalledExactlyOnceWith(product.id, 'inactive');
    expect(list).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Activar');
    expect(fixture.nativeElement.textContent).not.toContain('Desactivar');
    expect(fixture.nativeElement.textContent).toContain('Producto desactivado.');
    fixture.destroy();
  });

  it('keeps the confirmation available for retry after a failed status request', async () => {
    const inactive: Product = { ...product, status: 'inactive', capabilities: { editable_fields: [], activate: true, deactivate: false } };
    const setStatus = vi.fn()
      .mockReturnValueOnce(throwError(() => new Error('network')))
      .mockReturnValueOnce(of({ data: inactive }));
    const { fixture } = createFixture({ setStatus, list: vi.fn().mockReturnValue(of(pageResponse([product]))) });
    await settle(fixture);
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Desactivar')?.dispatchEvent(new Event('click', { bubbles: true }));
    fixture.detectChanges();
    let dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('button.danger') as HTMLButtonElement).click();
    await settle(fixture);
    expect(dialog.textContent).toContain('intenta nuevamente');
    (dialog.querySelector('button.danger') as HTMLButtonElement).click();
    await settle(fixture);
    expect(setStatus).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });
});
