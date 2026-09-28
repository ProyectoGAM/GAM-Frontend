import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { InventoryApi } from '../../services/inventory.api';
import type { ReferenceOptions } from '../../interfaces/inventory';
import { MovementsPage } from './movements.page';

const referenceOptions: ReferenceOptions = {
  production_units: [],
  suppliers: [],
  products: [{ value: 14, label: 'VAC-14 — Newcastle vacuna' }],
  stock_locations: [{ value: 3, label: 'Depósito Newcastle' }],
  types: { products: [], base_units: [], movements: [] },
  statuses: { production_units: [], products: [], stock_locations: [] },
};

const movementPage = {
  data: [],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
};

describe('MovementsPage searchable filters', () => {
  let fixture: ComponentFixture<MovementsPage>;
  let movements: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    movements = vi.fn().mockReturnValue(of(movementPage));
    await TestBed.configureTestingModule({
      imports: [MovementsPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => null } },
        { provide: InventoryApi, useValue: { movements } },
        { provide: InventoryReferenceApi, useValue: { options: () => of({ data: referenceOptions }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MovementsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('preserves Todos and Todas as empty-string filter options', () => {
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
    await fixture.componentInstance.load();

    expect(movements).toHaveBeenLastCalledWith(expect.objectContaining({
      product_id: 14,
      stock_location_id: 3,
      per_page: 25,
      page: 1,
    }));
  });

  it('clears both filter IDs back to empty and omits them from the existing query', async () => {
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
});
