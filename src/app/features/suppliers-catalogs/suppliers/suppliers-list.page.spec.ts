import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Navigation, provideRouter, Router } from '@angular/router';
import { IonModal } from '@ionic/angular';
import { of, Subject, throwError } from 'rxjs';

import { InventoryConfirmationDialogComponent } from '../../inventory/components/confirmation-dialog/confirmation-dialog.component';
import { Supplier, SupplierListResponse } from './suppliers.models';
import { SuppliersApi } from './suppliers.api';
import { SuppliersListPage } from './suppliers-list.page';
import { SupplierFormComponent } from './components/supplier-form/supplier-form.component';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';

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
    providers: [provideRouter([]), { provide: SuppliersApi, useValue: { list, changeSupplierStatus,
      create: vi.fn().mockReturnValue(of({ data: suppliers[0] })),
      updateSupplier: vi.fn().mockReturnValue(of({ data: suppliers[0] })) } },
      { provide: ProductionUnitsService, useValue: { departments: () => of([]), localities: () => of([]) } }],
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
  it('requests active suppliers on entry and renders compact cards with the API total', async () => {
    const list = vi.fn().mockReturnValue(of(response()));
    const fixture = createFixture(list);
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(list).toHaveBeenCalledExactlyOnceWith({ status: 'active', per_page: 25 }, 1);
    expect((host.querySelector('#supplier-status') as HTMLSelectElement).value).toBe('active');
    expect(host.querySelector('.result-summary')?.textContent).toBe('1 proveedor activo');
    expect(host.querySelector('ul.supplier-list > li.supplier-card')).not.toBeNull();
    expect(host.querySelector('.supplier-card')).not.toBeNull();
    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('Avícola del Sur');
    expect(host.textContent).toContain('Pando, Canelones');
    expect(host.textContent).toContain('Camino del Medio 120');
    expect(host.textContent).toContain('Activo');
    expect(Array.from(host.querySelectorAll('.supplier-card button')).map((button) => button.textContent?.trim()))
      .toEqual(['Editar', 'Desactivar']);
    expect(host.querySelector('.supplier-card button[aria-label="Desactivar proveedor Avícola del Sur"]')).not.toBeNull();
    expect(host.querySelector('.page-heading button.primary')?.getAttribute('aria-haspopup')).toBe('dialog');
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

  it('restores active suppliers and an empty search on the first page', async () => {
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

    (host.querySelector('.filters button[type="button"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(list).toHaveBeenNthCalledWith(3, { status: 'active', per_page: 25 }, 1);
    expect(search.value).toBe('');
    expect(status.value).toBe('active');
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

    expect(list).toHaveBeenNthCalledWith(3, { search: 'Avícola', status: 'active', per_page: 25 }, 2);
    fixture.destroy();
  });

  it('shows one-time success feedback passed in the navigation state', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())), true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Proveedor creado correctamente.');
    fixture.destroy();
  });

  it('opens editing in a modal with the selected supplier without navigating', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())));
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.editSupplier(suppliers[0]!);
    fixture.detectChanges(); await fixture.whenStable();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.editorOpen()).toBe(true);
    expect(fixture.componentInstance.editorTitle()).toBe('Editar proveedor');
    const form = fixture.debugElement.query(By.directive(SupplierFormComponent)).componentInstance as SupplierFormComponent;
    expect(form.form.getRawValue()).toEqual({ name: 'Avícola del Sur', address: 'Camino del Medio 120' });
    expect(form.selectedLocalityId()).toBe(6);
    fixture.destroy();
  });

  it('shows success feedback after an edit', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())), false, true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Proveedor actualizado correctamente.');
    fixture.destroy();
  });

  it('opens creation without navigating and discards cancelled drafts before reopening', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())));
    await fixture.whenStable(); fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (fixture.nativeElement.querySelector('.page-heading button.primary') as HTMLButtonElement).click();
    fixture.detectChanges(); await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(SupplierFormComponent)).componentInstance as SupplierFormComponent;
    expect(fixture.componentInstance.editorTitle()).toBe('Nuevo proveedor');
    expect(navigate).not.toHaveBeenCalled();
    form.form.setValue({ name: 'Borrador', address: 'Ruta 5' });
    form.cancel(); fixture.detectChanges();
    const modal = fixture.debugElement.query(By.directive(IonModal));
    expect(modal.componentInstance.isOpen).toBe(false);
    modal.triggerEventHandler('didDismiss'); fixture.detectChanges();
    expect(TestBed.inject(SuppliersApi).create).not.toHaveBeenCalled();
    fixture.componentInstance.openEditor(); fixture.detectChanges(); await fixture.whenStable();
    const fresh = fixture.debugElement.query(By.directive(SupplierFormComponent)).componentInstance as SupplierFormComponent;
    expect(fresh.form.getRawValue()).toEqual({ name: '', address: '' });
    fixture.destroy();
  });

  it('blocks duplicate saves and closing while pending, then refreshes the same listing filters without navigation', async () => {
    const list = vi.fn().mockReturnValue(of(response()));
    const fixture = createFixture(list);
    await fixture.whenStable();
    const request = new Subject<{ data: Supplier }>();
    const create = vi.spyOn(TestBed.inject(SuppliersApi), 'create').mockReturnValue(request);
    const filters = { status: 'active' as const, search: 'Sur', per_page: 25 };
    fixture.componentInstance.filters.set(filters);
    fixture.componentInstance.openEditor(); fixture.detectChanges(); await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(SupplierFormComponent)).componentInstance as SupplierFormComponent;
    form.form.setValue({ name: 'Distribuidora Sur', address: 'Ruta 5' });
    const save = form.submit(); fixture.detectChanges();
    const modal = fixture.debugElement.query(By.directive(IonModal));
    expect(modal.componentInstance.canDismiss).toBe(false);
    form.cancel(); fixture.componentInstance.closeEditor();
    expect(fixture.componentInstance.editorOpen()).toBe(true);
    await form.submit(); expect(create).toHaveBeenCalledOnce();
    request.next({ data: suppliers[0]! }); await save; await fixture.whenStable(); fixture.detectChanges();
    expect(modal.componentInstance.isOpen).toBe(false);
    expect(modal.componentInstance.canDismiss).toBe(true);
    expect(list).toHaveBeenLastCalledWith(filters, 1);
    expect(fixture.componentInstance.createdFeedback()).toBe(true);
    modal.triggerEventHandler('didDismiss'); fixture.detectChanges();
    expect(fixture.componentInstance.editor()).toBeNull();
    fixture.destroy();
  });

  it('keeps failed saves and the entered values inside the modal for retry', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response())));
    await fixture.whenStable();
    vi.spyOn(TestBed.inject(SuppliersApi), 'create').mockReturnValue(throwError(() => new Error('offline')));
    fixture.componentInstance.openEditor(); fixture.detectChanges(); await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(SupplierFormComponent)).componentInstance as SupplierFormComponent;
    form.form.setValue({ name: 'Distribuidora Sur', address: 'Ruta 5' });
    await form.submit(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.editorOpen()).toBe(true);
    const formHost = fixture.debugElement.query(By.directive(SupplierFormComponent)).nativeElement as HTMLElement;
    expect(formHost.querySelector('[role="alert"]')?.textContent).toContain('No se pudo guardar');
    expect(form.form.controls.name.value).toBe('Distribuidora Sur');
    fixture.destroy();
  });

  it('offers Activar for an inactive supplier', async () => {
    const inactive = { ...suppliers[0]!, status: 'inactive' as const };
    const fixture = createFixture(vi.fn().mockReturnValue(of(response([inactive]))));
    fixture.componentInstance.setStatus('inactive');
    fixture.componentInstance.applyFilters();
    await fixture.whenStable();
    fixture.detectChanges();

    const action = (fixture.nativeElement as HTMLElement).querySelector('.supplier-actions button:last-child');
    expect(action?.textContent?.trim()).toBe('Activar');
    expect(action?.getAttribute('aria-label')).toBe('Activar proveedor Avícola del Sur');
    expect(fixture.nativeElement.textContent).toContain('Inactivo');
    fixture.destroy();
  });

  it('can explicitly show all suppliers without sending a status filter', async () => {
    const list = vi.fn().mockReturnValue(of(response()));
    const fixture = createFixture(list);
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const status = host.querySelector('#supplier-status') as HTMLSelectElement;
    status.value = '';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    host.querySelector('.filters')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable(); fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith({ per_page: 25 }, 1);
    expect(host.querySelector('.result-summary')?.textContent).toBe('1 proveedor');
    fixture.destroy();
  });

  it('returns to the last available page when the filtered page becomes empty', async () => {
    const list = vi.fn()
      .mockReturnValueOnce(of(response(suppliers, 1, 2, 26)))
      .mockReturnValueOnce(of(response([], 2, 1, 25)))
      .mockReturnValueOnce(of(response(suppliers, 1, 1, 25)));
    const fixture = createFixture(list);
    await fixture.whenStable();
    await fixture.componentInstance.load(2);
    fixture.detectChanges();
    expect(list).toHaveBeenNthCalledWith(2, { status: 'active', per_page: 25 }, 2);
    expect(list).toHaveBeenNthCalledWith(3, { status: 'active', per_page: 25 }, 1);
    expect(fixture.componentInstance.state()).toBe('success');
    expect(fixture.componentInstance.meta()?.current_page).toBe(1);
    expect(fixture.nativeElement.querySelector('.result-summary')?.textContent).toBe('25 proveedores activos');
    fixture.destroy();
  });

  it('explains an empty active listing and offers changing the filters', async () => {
    const fixture = createFixture(vi.fn().mockReturnValue(of(response([]))));
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay proveedores activos para mostrar.');
    expect(fixture.nativeElement.textContent).toContain('Podés cambiar los filtros');
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
