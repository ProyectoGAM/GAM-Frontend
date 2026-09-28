import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Navigation, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { InventoryConfirmationDialogComponent } from '../../inventory/components/confirmation-dialog/confirmation-dialog.component';
import { Supplier, SupplierListResponse } from './suppliers.models';
import { SuppliersApi } from './suppliers.api';
import { SuppliersListPage } from './suppliers-list.page';

const suppliers: Supplier[] = [{
  id: 41,
  name: 'Avícola del Sur',
  address: 'Camino del Medio 120',
  status: 'active',
  locality: { id: 6, name: 'Pando', department: { id: 1, name: 'Canelones' } },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}];

const response = (
  data: Supplier[] = suppliers,
  currentPage = 1,
  lastPage = 1,
  total = data.length,
): SupplierListResponse => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: currentPage,
    from: data.length ? (currentPage - 1) * 25 + 1 : null,
    last_page: lastPage,
    per_page: 25,
    to: data.length ? (currentPage - 1) * 25 + data.length : null,
    total,
  },
});

const createFixture = (
  list: ReturnType<typeof vi.fn>,
  supplierCreated = false,
  supplierUpdated = false,
  changeSupplierStatus: ReturnType<typeof vi.fn> = vi.fn().mockReturnValue(of({ data: suppliers[0] })),
) => {
  TestBed.configureTestingModule({
    imports: [SuppliersListPage],
    providers: [provideRouter([]), { provide: SuppliersApi, useValue: { list, changeSupplierStatus } }],
  });
  if (supplierCreated || supplierUpdated) {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'getCurrentNavigation').mockReturnValue({
      extras: { state: { supplierCreated, supplierUpdated } },
    } as unknown as Navigation);
  }
  return TestBed.createComponent(SuppliersListPage);
};

describe('Suppliers list page', () => {
  it('renders supplier details and read-only status as cards without a horizontal table', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.supplier-card')).not.toBeNull();
    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('Avícola del Sur');
    expect(host.textContent).toContain('Pando, Canelones');
    expect(host.textContent).toContain('Camino del Medio 120');
    expect(host.textContent).toContain('Activo');
    expect(Array.from(host.querySelectorAll('.supplier-card button')).map((button) => button.textContent?.trim()))
      .toEqual(['Editar', 'Desactivar']);
    expect(host.querySelector('.supplier-card button[aria-label="Desactivar proveedor Avícola del Sur"]')).not.toBeNull();
    expect(host.querySelector('a.primary')?.getAttribute('href'))
      .toBe('/administracion/proveedores/proveedores/nuevo');
    fixture.destroy();
  });

  it('applies trimmed search and status filters on page one with the supported page size', async () => {
    const list = vi.fn().mockReturnValue(of(response()));
    const fixture = createFixture(list);
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector('#supplier-search') as HTMLInputElement;
    const status = host.querySelector('#supplier-status') as HTMLSelectElement;
    search.value = '  Avícola  ';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    status.value = 'active';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    host.querySelector('.filters')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(list).toHaveBeenNthCalledWith(2, { search: 'Avícola', status: 'active', per_page: 25 }, 1);
    fixture.destroy();
  });

  it('clears both filter controls and reloads the first page without optional filters', async () => {
    const list = vi.fn().mockReturnValue(of(response()));
    const fixture = createFixture(list);
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const search = host.querySelector('#supplier-search') as HTMLInputElement;
    const status = host.querySelector('#supplier-status') as HTMLSelectElement;
    search.value = 'Sur';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    status.value = 'inactive';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    host.querySelector('.filters')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    (host.querySelector('button[type="button"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(list).toHaveBeenNthCalledWith(3, { per_page: 25 }, 1);
    expect(search.value).toBe('');
    expect(status.value).toBe('');
    fixture.destroy();
  });

  it('uses pagination metadata to load the next page and preserves active filters', async () => {
    const list = vi.fn()
      .mockReturnValueOnce(of(response(suppliers, 1, 2, 30)))
      .mockReturnValueOnce(of(response(suppliers, 1, 2, 30)))
      .mockReturnValueOnce(of(response(suppliers, 2, 2, 30)));
    const fixture = createFixture(list);
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.setSearch('Avícola');
    fixture.componentInstance.applyFilters();
    await fixture.whenStable();
    fixture.detectChanges();

    const next = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.pagination button'))
      .find((button) => button.textContent?.includes('Siguiente')) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    next.click();
    await fixture.whenStable();

    expect(list).toHaveBeenNthCalledWith(3, { search: 'Avícola', per_page: 25 }, 2);
    fixture.destroy();
  });

  it('shows one-time success feedback passed in the navigation state', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())), true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Proveedor creado correctamente.');
    fixture.destroy();
  });

  it('opens the real edit route with the selected supplier in navigation state', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())));
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.editSupplier(suppliers[0]!);

    expect(navigate).toHaveBeenCalledWith(
      ['/administracion/proveedores/proveedores', 41, 'editar'],
      { state: { supplier: suppliers[0] } },
    );
    fixture.destroy();
  });

  it('shows success feedback after an edit', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())), false, true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Proveedor actualizado correctamente.');
    fixture.destroy();
  });

  it('offers Activar for an inactive supplier', async () => {
    const inactive = { ...suppliers[0]!, status: 'inactive' as const };
    const fixture = createFixture(vi.fn().mockReturnValue(of(response([inactive]))));
    await fixture.whenStable();
    fixture.detectChanges();

    const action = (fixture.nativeElement as HTMLElement).querySelector('.supplier-actions button:last-child');
    expect(action?.textContent?.trim()).toBe('Activar');
    expect(action?.getAttribute('aria-label')).toBe('Activar proveedor Avícola del Sur');
    expect(fixture.nativeElement.textContent).toContain('Inactivo');
    fixture.destroy();
  });

  it('opens the deactivate confirmation and dismissing it does not call the API', async () => {
    const changeSupplierStatus = vi.fn().mockReturnValue(of({ data: suppliers[0] }));
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())), false, false, changeSupplierStatus);
    await fixture.whenStable();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(InventoryConfirmationDialogComponent))
      .componentInstance as InventoryConfirmationDialogComponent;
    vi.spyOn(dialog, 'open').mockImplementation(() => {});

    (fixture.nativeElement as HTMLElement).querySelector('.supplier-actions button:last-child')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledOnce();
    expect(dialog.title).toBe('Desactivar proveedor');
    expect(dialog.message).toBe('¿Querés desactivar este proveedor?');
    expect(dialog.confirmLabel).toBe('Desactivar');
    dialog.dismissed.emit();

    expect(changeSupplierStatus).not.toHaveBeenCalled();
    expect(fixture.componentInstance.pendingStatusSupplier()).toBeNull();
    fixture.destroy();
  });

  it('changes status once and reloads the current page and filters', async () => {
    const inactive = { ...suppliers[0]!, status: 'inactive' as const };
    const list = vi.fn()
      .mockReturnValueOnce(of(response()))
      .mockReturnValueOnce(of(response(suppliers, 2, 3, 75)))
      .mockReturnValueOnce(of(response([inactive], 2, 3, 75)));
    const changeSupplierStatus = vi.fn().mockReturnValue(of({ data: inactive }));
    const fixture = createFixture(list, false, false, changeSupplierStatus);
    await fixture.whenStable();
    const filters = { status: 'active' as const, per_page: 25 };
    fixture.componentInstance.filters.set(filters);
    await fixture.componentInstance.load(2, filters);
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(InventoryConfirmationDialogComponent))
      .componentInstance as InventoryConfirmationDialogComponent;
    vi.spyOn(dialog, 'open').mockImplementation(() => {});

    (fixture.nativeElement as HTMLElement).querySelector('.supplier-actions button:last-child')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();
    dialog.confirmed.emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(changeSupplierStatus).toHaveBeenCalledExactlyOnceWith(41, 'inactive');
    expect(list).toHaveBeenNthCalledWith(3, filters, 2);
    expect(fixture.componentInstance.suppliers()[0]?.status).toBe('inactive');
    expect(fixture.nativeElement.textContent).toContain('Proveedor desactivado correctamente.');
    fixture.destroy();
  });

  it('keeps API failures visible in the dialog and allows retrying', async () => {
    const inactive = { ...suppliers[0]!, status: 'inactive' as const };
    const list = vi.fn().mockReturnValue(of(response()));
    const changeSupplierStatus = vi.fn()
      .mockReturnValueOnce(throwError(() => new Error('temporary failure')))
      .mockReturnValueOnce(of({ data: inactive }));
    const fixture = createFixture(list, false, false, changeSupplierStatus);
    await fixture.whenStable();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(InventoryConfirmationDialogComponent))
      .componentInstance as InventoryConfirmationDialogComponent;
    vi.spyOn(dialog, 'open').mockImplementation(() => {});

    (fixture.nativeElement as HTMLElement).querySelector('.supplier-actions button:last-child')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();
    dialog.confirmed.emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialog.errorMessage).toBe('No se pudo cambiar el estado del proveedor. Intentá nuevamente.');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent)
      .toContain('Intentá nuevamente.');
    expect(fixture.componentInstance.pendingStatusSupplier()).not.toBeNull();
    expect(dialog.open).toHaveBeenCalledOnce();

    dialog.confirmed.emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(changeSupplierStatus).toHaveBeenCalledTimes(2);
    expect(dialog.errorMessage).toBeNull();
    expect(fixture.componentInstance.pendingStatusSupplier()).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });
});
