import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import type { InventoryMovement, PaginatedResponse, ReferenceOptions } from '../../interfaces/inventory';
import { MovementsPage } from './movements.page';
import { MovementReversalDialogComponent } from '../../components/movement-reversal-dialog/movement-reversal-dialog.component';

const referenceOptions: ReferenceOptions = {
  production_units: [],
  suppliers: [{ value: 9, label: 'Proveedor de prueba' }],
  products: [{ value: 14, label: 'VAC-14 — Newcastle vacuna' }],
  stock_locations: [{ value: 3, label: 'Depósito Newcastle' }],
  types: { products: [], base_units: [], movements: [] },
  statuses: { production_units: [], products: [], stock_locations: [] },
};

const movementPage = {
  data: [],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, last_page: 1, per_page: 25, total: 0, from: null, to: null },
};

describe('MovementsPage searchable filters', () => {
  let fixture: ComponentFixture<MovementsPage>;
  let movements: ReturnType<typeof vi.fn>;
  let references: ReturnType<typeof vi.fn>;
  let movementDetails: ReturnType<typeof vi.fn>;
  let reverse: ReturnType<typeof vi.fn>;
  let restore: () => void;

  beforeEach(() => {
    restore = stubNativeDialog();
    movements = vi.fn().mockReturnValue(of(movementPage));
    references = vi.fn().mockReturnValue(of({ data: referenceOptions }));
    movementDetails = vi.fn(); reverse = vi.fn();
  });
  afterEach(() => { fixture?.destroy(); restore(); });

  async function render(query: Record<string, string> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MovementsPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => null } },
        { provide: InventoryApi, useValue: { movements, movement: movementDetails, reverse } },
        { provide: InventoryReferenceApi, useValue: { options: references } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MovementsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function openFilters(): HTMLDialogElement {
    (fixture.nativeElement.querySelector('.filter-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.filters-dialog') as HTMLDialogElement;
  }

  it('preserves Todos and Todas as empty-string filter options inside the modal', async () => {
    await render();
    expect(fixture.nativeElement.querySelector('.filters-dialog').open).toBe(false);
    expect(openFilters().open).toBe(true);
    const product = fixture.nativeElement.querySelector('#movement-filter-product') as HTMLInputElement;
    const location = fixture.nativeElement.querySelector('#movement-filter-location') as HTMLInputElement;

    expect(fixture.componentInstance.filters.controls.product_id.value).toBe('');
    expect(fixture.componentInstance.filters.controls.stock_location_id.value).toBe('');
    expect(product.value).toBe('Todos');
    expect(location.value).toBe('Todas');

    product.focus();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#movement-filter-product-listbox [role="option"]')?.textContent?.trim())
      .toBe('Todos');
    location.focus();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#movement-filter-location-listbox [role="option"]')?.textContent?.trim())
      .toBe('Todas');
  });

  it('keeps filter values as strings and sends the selected numeric IDs to the existing query', async () => {
    await render(); openFilters();
    const product = fixture.nativeElement.querySelector('#movement-filter-product') as HTMLInputElement;
    product.focus();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('#movement-filter-product-listbox [role="option"]:nth-child(2)') as HTMLElement).click();
    fixture.detectChanges();

    const location = fixture.nativeElement.querySelector('#movement-filter-location') as HTMLInputElement;
    location.focus();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('#movement-filter-location-listbox [role="option"]:nth-child(2)') as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.filters.controls.product_id.value).toBe('14');
    expect(fixture.componentInstance.filters.controls.stock_location_id.value).toBe('3');
    await fixture.componentInstance.applyFilters();

    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({
      product_id: 14,
      stock_location_id: 3,
      per_page: 25,
      page: 1,
    }));
  });

  it('clears both filter IDs back to empty and omits them from the existing query', async () => {
    await render(); openFilters();
    fixture.componentInstance.filters.patchValue({ product_id: '14', stock_location_id: '3' });
    fixture.componentInstance.clearFilters();
    await fixture.whenStable();

    expect(fixture.componentInstance.filters.controls.product_id.value).toBe('');
    expect(fixture.componentInstance.filters.controls.stock_location_id.value).toBe('');
    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({
      product_id: undefined,
      stock_location_id: undefined,
      per_page: 25,
      page: 1,
    }));
  });

  it('applies all six filters only after requesting results and starts on the first page', async () => {
    await render(); const dialog = openFilters();
    fixture.componentInstance.filters.setValue({ type: 'receipt', product_id: '14', stock_location_id: '3',
      supplier_id: '9', from: '2026-10-01', to: '2026-10-26' });
    expect(movements).toHaveBeenCalledOnce(); expect(fixture.componentInstance.activeFilterCount()).toBe(0);
    (fixture.nativeElement.querySelector('.sheet-action.primary') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(dialog.open).toBe(false); expect(fixture.componentInstance.activeFilterCount()).toBe(6);
    expect(movements).toHaveBeenLastCalledWith({ type: 'receipt', product_id: 14, stock_location_id: 3, supplier_id: 9,
      from: '2026-10-01', to: '2026-10-26', per_page: 25, page: 1 });
    expect(fixture.nativeElement.querySelector('.filter-count').textContent.trim()).toBe('6');
  });

  it('discards cancelled drafts and retains the applied query for pagination and retry', async () => {
    await render(); openFilters();
    fixture.componentInstance.filters.patchValue({ type: 'receipt', stock_location_id: '3' });
    await fixture.componentInstance.applyFilters();
    const dialog = openFilters();
    fixture.componentInstance.filters.patchValue({ type: 'issue', stock_location_id: '8', from: '2026-10-02' });
    dialog.dispatchEvent(new Event('cancel', { cancelable: true })); fixture.detectChanges();
    expect(dialog.open).toBe(false);
    await fixture.componentInstance.load(2);
    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'receipt', stock_location_id: 3, from: undefined, page: 2 }));
    await fixture.componentInstance.load();
    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'receipt', stock_location_id: 3, from: undefined }));
    openFilters();
    expect(fixture.componentInstance.filters.getRawValue()).toMatchObject({ type: 'receipt', stock_location_id: '3', from: '' });
  });

  it('clears only the draft until results are requested and returns focus after closing', async () => {
    await render(); openFilters();
    fixture.componentInstance.filters.patchValue({ type: 'receipt', product_id: '14' });
    await fixture.componentInstance.applyFilters(); openFilters();
    const count = movements.mock.calls.length;
    (fixture.nativeElement.querySelector('.sheet-action:not(.primary)') as HTMLButtonElement).click();
    expect(fixture.componentInstance.filters.controls.type.value).toBe('');
    expect(fixture.componentInstance.activeFilterCount()).toBe(2); expect(movements).toHaveBeenCalledTimes(count);
    (fixture.nativeElement.querySelector('.sheet-close') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.filter-trigger'));
    openFilters(); expect(fixture.componentInstance.filters.controls.type.value).toBe('receipt');
    fixture.componentInstance.clearDraftFilters(); await fixture.componentInstance.applyFilters();
    expect(fixture.componentInstance.activeFilterCount()).toBe(0);
    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({ type: undefined, product_id: undefined, page: 1 }));
  });

  it('preserves product and location links from stock in the initial query and filter count', async () => {
    await render({ product_id: '14', stock_location_id: '3' });
    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({ product_id: 14, stock_location_id: 3 }));
    expect(fixture.componentInstance.activeFilterCount()).toBe(2);
    openFilters(); expect(fixture.componentInstance.filters.controls.product_id.value).toBe('14');
  });

  it('keeps type and date filters available when reference options fail and can retry options', async () => {
    references.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await render(); openFilters();
    expect(fixture.nativeElement.querySelector('app-filter-dialog [role="alert"]').textContent).toContain('Reintentar filtros');
    expect(fixture.nativeElement.querySelector('#movement-filter-type').disabled).toBe(false);
    expect(fixture.componentInstance.movementTypes()).toHaveLength(7);
    fixture.componentInstance.filters.patchValue({ type: 'loss', from: '2026-10-01' });
    await fixture.componentInstance.applyFilters();
    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'loss', from: '2026-10-01' }));
    await fixture.componentInstance.loadReferences(); expect(fixture.componentInstance.referencesState()).toBe('success');
  });

  it('ignores a slower response for a query that has already been replaced', async () => {
    await render(); openFilters();
    const old = new Subject<PaginatedResponse<InventoryMovement>>();
    movements.mockReturnValueOnce(old);
    fixture.componentInstance.filters.controls.type.setValue('receipt');
    const pending = fixture.componentInstance.applyFilters();
    fixture.componentInstance.filters.controls.type.setValue('loss');
    movements.mockReturnValueOnce(of({ ...movementPage, meta: { ...movementPage.meta, total: 4 } }));
    await fixture.componentInstance.applyFilters();
    old.next({ ...movementPage, meta: { ...movementPage.meta, total: 99 } }); await pending;
    expect(fixture.componentInstance.meta()?.total).toBe(4);
  });

  it('shows the responsible name supplied by inventory, with an explicit fallback for unavailable names', async () => {
    const movement: InventoryMovement = { id: 1, operation_id: 'op-1', type: 'receipt', supplier: null,
      reference_type: null, reference_id: null, reason: 'Ingreso de prueba', occurred_at: '2026-10-26T12:00:00Z',
      created_by: 5, created_by_name: 'María Responsable', reverses_movement_id: null, created_at: '2026-10-26T12:00:00Z' };
    movements.mockReturnValue(of({ ...movementPage, data: [movement,
      { ...movement, id: 2, created_by: null, created_by_name: null },
      { ...movement, id: 3, created_by: 7, created_by_name: '   ' },
      { ...movement, id: 4, created_by_name: '<b>Nombre literal</b>' },
    ] }));
    await render();
    const cells = Array.from(fixture.nativeElement.querySelectorAll('td[data-label="Responsable"]') as NodeListOf<HTMLElement>);
    expect(cells.map((cell) => cell.textContent)).toEqual(['María Responsable', 'No disponible', 'No disponible', '<b>Nombre literal</b>']);
    expect(cells[3].querySelector('b')).toBeNull();
  });

  it('reverses from a list row only after confirmation, then reloads the applied query and page', async () => {
    const record: InventoryMovement = { id: 11, operation_id: 'op-11', type: 'receipt', reference_type: null,
      reference_id: null, reason: 'Ingreso', occurred_at: '2026-10-26T12:00:00Z', created_by: 1, created_by_name: 'Responsable',
      reverses_movement_id: null, created_at: '2026-10-26T12:00:00Z' };
    movements.mockReturnValue(of({ ...movementPage, data: [record], meta: { ...movementPage.meta, current_page: 2, last_page: 3 } }));
    movementDetails.mockReturnValue(of({ data: { ...record, lines: [] } }));
    reverse.mockReturnValue(of({ data: { ...record, id: 12, type: 'reversal' } }));
    await render(); openFilters(); fixture.componentInstance.filters.controls.type.setValue('receipt');
    await fixture.componentInstance.applyFilters(); fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('button.reversal-action') as HTMLButtonElement;
    trigger.click(); await fixture.whenStable(); fixture.detectChanges();
    const modal = fixture.debugElement.query(By.directive(MovementReversalDialogComponent)).componentInstance as MovementReversalDialogComponent;
    expect(movementDetails).toHaveBeenCalledWith(11); expect(reverse).not.toHaveBeenCalled();
    modal.form.controls.reason.setValue('Registro duplicado'); modal.review();
    expect(reverse).not.toHaveBeenCalled(); await modal.confirm(); await fixture.whenStable(); fixture.detectChanges();
    expect(reverse).toHaveBeenCalledWith(11, 'Registro duplicado', expect.any(String));
    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'receipt', page: 2 }));
    expect(fixture.componentInstance.success()).toContain('Reversión registrada');
  });

  it('keeps details available but omits reversal buttons without adjustment permission', async () => {
    TestBed.overrideProvider(AuthStore, { useValue: { isAdmin: () => false, user: () => ({ permissions: ['inventory.view'] }) } });
    movements.mockReturnValue(of({ ...movementPage, data: [{ id: 11, type: 'receipt', occurred_at: '2026-10-26T12:00:00Z' }] }));
    await render();
    expect(fixture.nativeElement.querySelector('button.reversal-action')).toBeNull();
    expect(fixture.nativeElement.querySelector('.movement-actions a').textContent).toContain('Ver detalle');
  });
});
