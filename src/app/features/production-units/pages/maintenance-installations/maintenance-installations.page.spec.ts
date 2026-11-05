import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { maintenanceHouse } from '../../testing/maintenance-fixtures';
import { MaintenanceInstallationsPage } from './maintenance-installations.page';

describe('MaintenanceInstallationsPage', () => {
  let fixture: ComponentFixture<MaintenanceInstallationsPage>;
  let poultry: ReturnType<typeof vi.fn>;
  let feed: ReturnType<typeof vi.fn>;
  let restoreDialog: () => void;
  const selectedId = signal<number | null>(null);
  const isAdmin = signal(true);
  const secondUnit = { ...maintenanceHouse.production_unit, id: 8, name: 'Santa Clara' };
  const units = [maintenanceHouse.production_unit, secondUnit];
  beforeEach(() => {
    restoreDialog = stubNativeDialog();
    selectedId.set(null);
    isAdmin.set(true);
    poultry = vi.fn().mockReturnValue(of([{ ...maintenanceHouse, productionUnit: maintenanceHouse.production_unit }]));
    feed = vi.fn().mockReturnValue(of([{ ...maintenanceHouse, id: 23, name: 'Planta Santa Clara', type: 'feed', status: 'inactive',
      productionUnit: secondUnit }]));
    TestBed.configureTestingModule({ imports: [MaintenanceInstallationsPage], providers: [provideRouter([]),
      { provide: AuthStore, useValue: { isAdmin } },
      { provide: ProductionUnitsService, useValue: { listAllPoultryHouses: poultry, listAllFeedPlants: feed } },
      { provide: AdminUnitContextService, useValue: { selectedId, units: () => units, state: () => 'ready', select: (id: number | null) => selectedId.set(id) } },
    ] });
  });
  afterEach(() => restoreDialog());
  function render(): void { fixture = TestBed.createComponent(MaintenanceInstallationsPage); fixture.detectChanges(); }

  it('offers poultry and feed installation histories, including inactive installations', () => {
    render();
    expect(fixture.nativeElement.textContent).toContain('Galpón Norte'); expect(fixture.nativeElement.textContent).toContain('Planta Santa Clara');
    const links = [...fixture.nativeElement.querySelectorAll('.installation-card')] as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/administracion/ubicaciones/mantenimiento/7/galpon/22', '/administracion/ubicaciones/mantenimiento/8/galpon/23']);
  });

  it('applies the filter drafts only after confirming and combines them with search', () => {
    render();
    const directory: HTMLElement = fixture.nativeElement;
    const trigger = directory.querySelector<HTMLButtonElement>('.filter-trigger')!;
    const dialog = directory.querySelector<HTMLDialogElement>('dialog')!;
    const select = directory.querySelector<HTMLSelectElement>('#maintenance-filter-unit')!;
    const type = directory.querySelector<HTMLSelectElement>('#maintenance-filter-type')!;
    const apply = dialog.querySelector<HTMLButtonElement>('.sheet-action.primary')!;
    const clear = dialog.querySelector<HTMLButtonElement>('.sheet-action.secondary')!;
    const close = dialog.querySelector<HTMLButtonElement>('.sheet-close')!;

    expect(dialog.open).toBe(false);
    trigger.click();
    fixture.detectChanges();
    expect(dialog.open).toBe(true);
    select.value = '7';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(selectedId()).toBeNull();
    expect(directory.querySelectorAll('.installation-card')).toHaveLength(2);
    close.click();
    trigger.click();
    fixture.detectChanges();
    expect(select.value).toBe('');

    select.value = '8';
    select.dispatchEvent(new Event('change'));
    type.value = 'feed';
    type.dispatchEvent(new Event('change'));
    apply.click();
    fixture.detectChanges();
    expect(dialog.open).toBe(false);
    expect(selectedId()).toBe(8);
    expect(directory.querySelectorAll('.installation-card')).toHaveLength(1);
    expect(directory.querySelector('.installation-card')?.textContent).toContain('Planta Santa Clara');

    fixture.componentInstance.query.set('galpon');
    fixture.detectChanges();
    expect(directory.textContent).toContain('Sin instalaciones');
    trigger.click();
    clear.click();
    fixture.detectChanges();
    expect(selectedId()).toBe(8);
    apply.click();
    fixture.detectChanges();
    expect(selectedId()).toBeNull();
    expect(directory.querySelector('.installation-card')?.textContent).toContain('Galpón Norte');
    expect(poultry).toHaveBeenCalledOnce(); expect(feed).toHaveBeenCalledOnce();
  });

  it('offers only authorized units to a non-admin user', () => {
    isAdmin.set(false);
    selectedId.set(8);
    render();
    const directory: HTMLElement = fixture.nativeElement;
    const select = directory.querySelector<HTMLSelectElement>('#maintenance-filter-unit')!;
    expect([...select.options].map((option) => option.value)).toEqual(['7', '8']);
    expect(select.value).toBe('8');
    expect(directory.querySelectorAll('.installation-card')).toHaveLength(1);
  });

  it('distinguishes directory errors from empty data and can retry', () => {
    feed.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 }))); render();
    expect(fixture.nativeElement.textContent).toContain('No tenés permiso');
    expect(fixture.nativeElement.textContent).not.toContain('Sin instalaciones');
    feed.mockReturnValue(of([])); fixture.componentInstance.load(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Galpón Norte');
  });
});
