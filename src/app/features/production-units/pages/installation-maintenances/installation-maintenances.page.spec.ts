import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { UsersService } from '../../../users/services/users.service';
import { InstallationMaintenanceService } from '../../services/installation-maintenance.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { maintenanceHouse, maintenanceRecord, maintenanceUser } from '../../testing/maintenance-fixtures';
import { MaintenancePage } from '../../interfaces/installation-maintenance.interface';
import { InstallationMaintenancesPage } from './installation-maintenances.page';

describe('InstallationMaintenancesPage', () => {
  let fixture: ComponentFixture<InstallationMaintenancesPage>;
  let list: ReturnType<typeof vi.fn>;
  let getHouse: ReturnType<typeof vi.fn>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const user = signal(maintenanceUser);
  const response: MaintenancePage = { data: [maintenanceRecord], meta: { current_page: 1, last_page: 2, total: 21 } };
  beforeEach(() => {
    user.set(maintenanceUser);
    list = vi.fn().mockReturnValue(of(response)); getHouse = vi.fn().mockReturnValue(of({ data: maintenanceHouse }));
    params = new BehaviorSubject(convertToParamMap({ id: '7', houseId: '22' }));
    TestBed.configureTestingModule({ imports: [InstallationMaintenancesPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: AuthStore, useValue: { user, session: () => null } },
      { provide: InstallationMaintenanceService, useValue: { list } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: getHouse } },
      { provide: UsersService, useValue: { allUsers: vi.fn().mockResolvedValue([]) } },
    ] });
  });
  function render(): void { fixture = TestBed.createComponent(InstallationMaintenancesPage); fixture.detectChanges(); }

  it('shows real history data and navigates to the next page without loading stock or lots', () => {
    render(); expect(list).toHaveBeenCalledWith(22, {}, 1);
    expect(fixture.nativeElement.textContent).toContain('Revisión de bebederos');
    expect(fixture.nativeElement.textContent).toContain('Martín Pérez'); expect(fixture.nativeElement.textContent).toContain('UYU');
    expect(fixture.nativeElement.querySelector('.back-link').getAttribute('href')).toBe('/administracion/unidades-productivas/7/galpon/22');
    fixture.componentInstance.goToPage(1); expect(list).toHaveBeenLastCalledWith(22, {}, 2);
    expect(fixture.nativeElement.querySelector('app-feed-stock-detail')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-poultry-house-detail-content')).toBeNull();
  });

  it('supports plants through the same screen and filters by state and date range', () => {
    getHouse.mockReturnValue(of({ data: { ...maintenanceHouse, type: 'feed', name: 'Planta de ración 01' } })); render();
    fixture.componentInstance.filtersForm.setValue({ status: 'cancelled', from: '2026-01-01', to: '2026-02-01' }); fixture.componentInstance.applyFilters();
    expect(list).toHaveBeenLastCalledWith(22, { status: 'cancelled', date_from: '2026-01-01', date_to: '2026-02-01' }, 1);
    fixture.componentInstance.filtersForm.patchValue({ to: '2025-01-01' }); list.mockClear(); fixture.componentInstance.applyFilters();
    expect(list).not.toHaveBeenCalled(); expect(fixture.componentInstance.filterError()).toContain('posterior');
  });

  it('cancels outdated history requests when applying another filter', () => {
    const old = new Subject<MaintenancePage>(); list.mockReturnValueOnce(old).mockReturnValue(of({ ...response, data: [] })); render();
    fixture.componentInstance.filtersForm.controls.status.setValue('cancelled'); fixture.componentInstance.applyFilters();
    old.next(response); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Sin mantenimientos');
    expect(fixture.nativeElement.textContent).not.toContain('Revisión de bebederos');
  });

  it('checks the installation parent before querying history', () => {
    getHouse.mockReturnValue(of({ data: { ...maintenanceHouse, production_unit_id: 8 } })); render();
    expect(list).not.toHaveBeenCalled(); expect(fixture.nativeElement.textContent).toContain('no pertenece');
  });

  it('returns to the maintenance directory when the history was opened from the sidebar', () => {
    TestBed.overrideProvider(ActivatedRoute, { useValue: { paramMap: params, snapshot: { data: { maintenanceHub: true } } } });
    render();
    expect(fixture.nativeElement.querySelector('.back-link').getAttribute('href')).toBe('/administracion/ubicaciones/mantenimiento');
    expect(fixture.nativeElement.textContent).toContain('Ver detalle de la instalación');
  });

  it('shows history but hides registration for read-only users', () => {
    user.set({ ...maintenanceUser, roles: [], permissions: ['poultry-houses.view'] }); render();
    expect(fixture.nativeElement.querySelector('.history-heading ion-button.primary')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Historial de trabajos');
  });

  it('does not apply cancelled date drafts when changing the record status', () => {
    const restore = stubNativeDialog();
    try {
      render(); fixture.componentInstance.openDates(new Event('click'));
      fixture.componentInstance.dateForm.patchValue({ from: '2026-01-01' });
      fixture.nativeElement.querySelector('app-filter-dialog dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
      fixture.componentInstance.filtersForm.controls.status.setValue('completed'); fixture.componentInstance.applyFilters();
      expect(list).toHaveBeenLastCalledWith(22, { status: 'completed', date_from: undefined, date_to: undefined }, 1);
    } finally { restore(); }
  });
});
