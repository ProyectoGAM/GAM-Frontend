import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnit } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { InventoryReferenceApi } from '../../services/inventory-reference.api';
import { StockLocationsApi } from '../../services/stock-locations.api';
import { StockLocation } from '../../interfaces/inventory';
import { StockLocationsPage } from './stock-locations.page';
import { stubNativeDialog } from '../../testing/native-dialog-test';

const productionUnit: ProductionUnit = {
  id: 23,
  name: 'Granja Oeste',
  status: 'active',
  locality: {
    id: 1,
    department_id: 1,
    name: 'Localidad',
    department: { id: 1, name: 'Departamento' },
  },
};

const location: StockLocation = {
  id: 5,
  name: 'Depósito principal',
  system_managed: false,
  production_unit: { id: 23, name: 'Granja Oeste', status: 'active' },
  status: 'active',
};

const locationPage = {
  data: [location],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: 1, last_page: 1, per_page: 25, to: 1, total: 1 },
};

describe('StockLocations production-unit integration', () => {
  it('uses the sidebar UP as a locked location filter', async () => {
    const selectedId = signal<number | null>(23);
    const requests: Array<{ production_unit_id?: number }> = [];
    const fixture = TestBed.configureTestingModule({
      imports: [StockLocationsPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: AdminUnitContextService, useValue: { selectedId } },
        { provide: ProductionUnitsService, useValue: { listAll: () => of([productionUnit]) } },
        { provide: StockLocationsApi, useValue: {
          list: (filters: { production_unit_id?: number }) => { requests.push(filters); return of(locationPage); },
        } },
      ],
    }).createComponent(StockLocationsPage);

    await fixture.whenStable();
    fixture.detectChanges();
    expect(requests.at(-1)?.production_unit_id).toBe(23);
    expect(fixture.componentInstance.filters.controls.production_unit_id.disabled).toBe(true);
    selectedId.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(requests.at(-1)?.production_unit_id).toBeUndefined();
    fixture.destroy();
  });

  it('keeps locations visible and retries a failed unit load', async () => {
    let listAllCalls = 0;
    let referenceOptionsCalls = 0;
    const fixture = TestBed.configureTestingModule({
      imports: [StockLocationsPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => {
          listAllCalls += 1;
          return listAllCalls === 1 ? throwError(() => new Error('offline')) : of([productionUnit]);
        } } },
        { provide: StockLocationsApi, useValue: {
          list: () => of(locationPage),
          create: () => of({ data: location }),
          update: () => of({ data: location }),
          setStatus: () => of({ data: location }),
        } },
        { provide: InventoryReferenceApi, useValue: { options: () => { referenceOptionsCalls += 1; return of({ data: { production_units: [] } }); } } },
      ],
    }).createComponent(StockLocationsPage);

    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('success');
    expect(fixture.nativeElement.textContent).toContain('Depósito principal');
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las Unidades Productivas. Intentá nuevamente.');
    expect(referenceOptionsCalls).toBe(0);

    const retry = fixture.nativeElement.querySelector('.feedback.error button') as HTMLButtonElement;
    retry.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listAllCalls).toBe(2);
    expect(fixture.componentInstance.locations()).toEqual([location]);
    expect(fixture.componentInstance.productionUnits()).toEqual([productionUnit]);
    expect(fixture.nativeElement.textContent).toContain('Granja Oeste');
    fixture.destroy();
  });

  it('sends numeric production-unit IDs in location filters and create requests', async () => {
    let referenceOptionsCalls = 0;
    const filters: unknown[] = [];
    const createBodies: unknown[] = [];
    const fixture = TestBed.configureTestingModule({
      imports: [StockLocationsPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => of([productionUnit]) } },
        { provide: StockLocationsApi, useValue: {
          list: (value: unknown) => { filters.push(value); return of(locationPage); },
          create: (body: unknown) => { createBodies.push(body); return of({ data: location }); },
          update: () => of({ data: location }),
          setStatus: () => of({ data: location }),
        } },
        { provide: InventoryReferenceApi, useValue: { options: () => { referenceOptionsCalls += 1; return of({ data: { production_units: [] } }); } } },
      ],
    }).createComponent(StockLocationsPage);

    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.filters.patchValue({ production_unit_id: '23' });
    await page.load();
    page.startCreate();
    page.form.patchValue({ name: 'Depósito nuevo', production_unit_id: '23' });
    await page.save();

    expect((filters[filters.length - 1] as { production_unit_id: unknown }).production_unit_id).toBe(23);
    expect(typeof (filters[filters.length - 1] as { production_unit_id: unknown }).production_unit_id).toBe('number');
    expect(createBodies).toEqual([{ name: 'Depósito nuevo', production_unit_id: 23 }]);
    expect(typeof (createBodies[0] as { production_unit_id: unknown }).production_unit_id).toBe('number');
    expect(referenceOptionsCalls).toBe(0);
    fixture.destroy();
  });
});

describe('StockLocations activation confirmation', () => {
  let restoreDialog: () => void;
  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => { restoreDialog(); });

  const createFixture = async (setStatus: ReturnType<typeof vi.fn>, canManage = true) => {
    const fixture = await TestBed.configureTestingModule({
      imports: [StockLocationsPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => canManage, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => of([productionUnit]) } },
        { provide: StockLocationsApi, useValue: {
          list: () => of(locationPage),
          create: () => of({ data: location }),
          update: () => of({ data: location }),
          setStatus,
        } },
      ],
    }).compileComponents();
    const pageFixture = TestBed.createComponent(StockLocationsPage);
    pageFixture.detectChanges();
    await pageFixture.whenStable();
    pageFixture.detectChanges();
    return pageFixture;
  };

  it('keeps edit and status actions available for manually managed locations', async () => {
    const fixture = await createFixture(vi.fn());
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.querySelectorAll('.row-actions button')).toHaveLength(2);
    expect(row.textContent).toContain('Editar');
    expect(row.textContent).toContain('Desactivar');
    expect(row.textContent).not.toContain('Ubicación gestionada por el sistema');
    fixture.destroy();
  });

  it('shows system-managed information and hides actions for managers', async () => {
    const fixture = await createFixture(vi.fn());
    const managedLocation = Object.assign({}, location, { system_managed: true });
    fixture.componentInstance.locations.set([managedLocation]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.querySelector('.row-actions')).toBeNull();
    expect(row.querySelectorAll('button')).toHaveLength(0);
    expect(row.textContent).toContain('Ubicación gestionada por el sistema');
    fixture.destroy();
  });

  it('shows system-managed information instead of read-only copy for non-managers', async () => {
    const fixture = await createFixture(vi.fn(), false);
    const managedLocation = Object.assign({}, location, { system_managed: true });
    fixture.componentInstance.locations.set([managedLocation]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.querySelectorAll('button')).toHaveLength(0);
    expect(row.textContent).toContain('Ubicación gestionada por el sistema');
    expect(row.textContent).not.toContain('Solo lectura');
    fixture.destroy();
  });

  it('cancels without an API call, then submits once and locks while busy', async () => {
    const pendingStatus = new Subject<{ data: StockLocation }>();
    const setStatus = vi.fn()
      .mockReturnValueOnce(pendingStatus)
      .mockReturnValueOnce(of({ data: { ...location, status: 'active' as const } }));
    const fixture = await createFixture(setStatus);
    const page = fixture.componentInstance;
    const mutationPromises: Promise<void>[] = [];
    const mutate = page.toggleStatus.bind(page);
    vi.spyOn(page, 'toggleStatus').mockImplementation(() => {
      const promise = mutate();
      mutationPromises.push(promise);
      return promise;
    });
    const opener = fixture.nativeElement.querySelector('.row-actions button:nth-child(2)') as HTMLButtonElement;

    opener.click();
    fixture.detectChanges();
    let dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain(location.name);
    expect(dialog.textContent).toContain('No se podrá elegir en movimientos nuevos');
    expect(setStatus).not.toHaveBeenCalled();
    (dialog.querySelector('button.secondary') as HTMLButtonElement).click();
    expect(dialog.open).toBe(false);
    expect(page.pendingStatusLocation()).toBeNull();
    expect(setStatus).not.toHaveBeenCalled();

    opener.click();
    fixture.detectChanges();
    dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('button.danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith(location.id, 'inactive');
    expect((dialog.querySelector('button.danger') as HTMLButtonElement).disabled).toBe(true);
    await page.toggleStatus();
    expect(setStatus).toHaveBeenCalledTimes(1);

    pendingStatus.next({ data: { ...location, status: 'inactive' } });
    pendingStatus.complete();
    await mutationPromises[0];
    fixture.detectChanges();
    expect(dialog.open).toBe(false);
    expect(page.success()).toBe('Ubicación desactivada.');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1'));

    page.requestStatusChange(new Event('click'), { ...location, status: 'inactive' });
    fixture.detectChanges();
    dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.textContent).toContain('Se podrá elegir en movimientos nuevos');
    (dialog.querySelector('button.danger') as HTMLButtonElement).click();
    await mutationPromises[2];
    fixture.detectChanges();
    expect(setStatus).toHaveBeenLastCalledWith(location.id, 'active');
    expect(page.success()).toBe('Ubicación activada.');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1'));
    fixture.destroy();
  });

  it('keeps the confirmation open and shows an API error', async () => {
    const setStatus = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const fixture = await createFixture(setStatus);
    (fixture.nativeElement.querySelector('.row-actions button:nth-child(2)') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('dialog button.danger') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar con el servidor');
    expect(setStatus).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
});

describe('StockLocations editor validation visibility', () => {
  const createEditorFixture = async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [StockLocationsPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ permissions: [] }) } },
        { provide: ProductionUnitsService, useValue: { listAll: () => of([productionUnit]) } },
        { provide: StockLocationsApi, useValue: {
          list: () => of(locationPage),
          create: () => of({ data: location }),
          update: () => of({ data: location }),
          setStatus: () => of({ data: location }),
        } },
      ],
    }).compileComponents();
    const pageFixture = TestBed.createComponent(StockLocationsPage);
    pageFixture.detectChanges();
    await pageFixture.whenStable();
    pageFixture.detectChanges();
    pageFixture.componentInstance.startCreate();
    pageFixture.detectChanges();
    return pageFixture;
  };

  it('keeps an untouched required name error hidden after focus and blur', async () => {
    const fixture = await createEditorFixture();
    const input = fixture.nativeElement.querySelector('#location-name') as HTMLInputElement;
    const name = fixture.componentInstance.form.controls.name;

    input.focus();
    input.blur();
    fixture.detectChanges();

    expect(name.touched).toBe(true);
    expect(name.pristine).toBe(true);
    expect(fixture.nativeElement.querySelector('.editor .field-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    fixture.destroy();
  });

  it('shows an edited invalid name and aligns its ARIA attributes with the message', async () => {
    const fixture = await createEditorFixture();
    const input = fixture.nativeElement.querySelector('#location-name') as HTMLInputElement;
    const name = fixture.componentInstance.form.controls.name;

    input.value = 'Depósito nuevo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    input.blur();
    fixture.detectChanges();

    expect(name.dirty).toBe(true);
    expect(name.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('.editor .field-error')?.textContent).toContain('Escribí un nombre para la ubicación.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('location-name-error');
    fixture.destroy();
  });

  it('shows a required name error after submit and clears it when the editor resets', async () => {
    const fixture = await createEditorFixture();
    const page = fixture.componentInstance;
    const input = fixture.nativeElement.querySelector('#location-name') as HTMLInputElement;

    await page.save();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.editor .field-error')?.textContent).toContain('Escribí un nombre para la ubicación.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('location-name-error');

    page.cancelEdit();
    page.startCreate();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.editor .field-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    fixture.destroy();
  });
});
