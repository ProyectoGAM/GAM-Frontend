import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { InventoryMovement } from '../../interfaces/inventory';
import { InventoryApi } from '../../services/inventory.api';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { stubNativeDialog } from '../../testing/native-dialog-test';
import { MovementDetailPage } from './movement-detail.page';

const movement: InventoryMovement = {
  id: 11,
  operation_id: 'technical-operation-key',
  type: 'issue',
  supplier: null,
  reference_type: null,
  reference_id: null,
  reason: 'Uso diario',
  occurred_at: '2026-01-01T10:00:00Z',
  created_by: 3,
  reverses_movement_id: null,
  created_at: '2026-01-01T10:01:00Z',
  lines: [{ id: 5, product_id: 4, stock_location_id: 2, unit: 'kg', physical_delta: '-1' }],
};

describe('Inventory movement detail', () => {
  it('fills a missing product name from the existing reference options', async () => {
    await TestBed.configureTestingModule({
      imports: [MovementDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '11' } } } },
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: [] }) } },
        { provide: InventoryApi, useValue: { movement: () => of({ data: movement }) } },
        { provide: InventoryReferenceApi, useValue: { options: () => of({ data: {
          production_units: [], suppliers: [], products: [{ value: 4, label: 'Alimento de postura' }], stock_locations: [{ value: 2, label: 'Depósito principal' }],
          types: { products: [], base_units: [], movements: [] },
          statuses: { production_units: [], products: [], stock_locations: [] },
        } }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MovementDetailPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const line = fixture.componentInstance.movement()?.lines?.[0];
    if (!line) throw new Error('Expected movement detail to include its line');
    expect(fixture.componentInstance.productName(line)).toBe('Alimento de postura');
    expect(fixture.nativeElement.textContent).not.toContain('Producto #4');
    fixture.destroy();
  });
});

describe('Inventory movement reversal confirmation', () => {
  let restoreDialog: () => void;
  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => { restoreDialog(); });

  const createFixture = async (reverse: ReturnType<typeof vi.fn>) => {
    const fixture = await TestBed.configureTestingModule({
      imports: [MovementDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '11' } } } },
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: InventoryApi, useValue: { movement: () => of({ data: movement }), reverse } },
        { provide: InventoryReferenceApi, useValue: { options: () => of({ data: {
          production_units: [], suppliers: [], products: [{ value: 4, label: 'Alimento de postura' }], stock_locations: [{ value: 2, label: 'Depósito principal' }], types: { products: [], base_units: [], movements: [] },
          statuses: { production_units: [], products: [], stock_locations: [] },
        } }) } },
      ],
    }).compileComponents();
    const pageFixture = TestBed.createComponent(MovementDetailPage);
    pageFixture.detectChanges();
    await pageFixture.whenStable();
    pageFixture.detectChanges();
    return pageFixture;
  };

  it('does not call the API on cancel, submits the reason once, and stays locked while busy', async () => {
    const pending = new Subject<{ data: InventoryMovement }>();
    const reverse = vi.fn().mockReturnValue(pending);
    const fixture = await createFixture(reverse);
    const page = fixture.componentInstance;
    page.reverseForm.controls.reason.setValue('Registro duplicado');
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('.reversal button[type="submit"]') as HTMLButtonElement;

    opener.click();
    fixture.detectChanges();
    let dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Alimento de postura');
    expect(dialog.textContent).toContain('Registro duplicado');
    dialog.querySelector('button.secondary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog.open).toBe(false);
    expect(reverse).not.toHaveBeenCalled();
    expect(page.reverseForm.controls.reason.value).toBe('Registro duplicado');

    opener.click();
    fixture.detectChanges();
    dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('button.danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(reverse).toHaveBeenCalledWith(11, 'Registro duplicado', expect.any(String));
    expect((dialog.querySelector('button.danger') as HTMLButtonElement).disabled).toBe(true);
    await page.reverse();
    expect(reverse).toHaveBeenCalledTimes(1);

    pending.next({ data: movement });
    pending.complete();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(dialog.open).toBe(false);
    expect(page.success()).toContain('Reversión registrada');
    fixture.destroy();
  });

  it('keeps the dialog open and displays the API error for a retry', async () => {
    const reverse = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const fixture = await createFixture(reverse);
    fixture.componentInstance.reverseForm.controls.reason.setValue('Motivo válido');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.reversal button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    let dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('button.danger') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar con el servidor');
    expect(fixture.componentInstance.reverseForm.controls.reason.value).toBe('Motivo válido');
    fixture.destroy();
  });
});
