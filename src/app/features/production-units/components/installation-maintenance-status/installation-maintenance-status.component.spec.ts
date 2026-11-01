import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ProductionUnitsService } from '../../services/production-units.service';
import { maintenanceHouse, maintenanceUser } from '../../testing/maintenance-fixtures';
import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { InstallationMaintenanceStatusComponent } from './installation-maintenance-status.component';

describe('InstallationMaintenanceStatusComponent', () => {
  let fixture: ComponentFixture<InstallationMaintenanceStatusComponent>;
  let update: ReturnType<typeof vi.fn>;
  const user = signal(maintenanceUser);
  beforeEach(() => {
    user.set(maintenanceUser);
    update = vi.fn().mockReturnValue(of({ data: { ...maintenanceHouse, status: 'maintenance' } }));
    TestBed.configureTestingModule({ imports: [InstallationMaintenanceStatusComponent], providers: [
      { provide: ProductionUnitsService, useValue: { updatePoultryHouseStatus: update } },
      { provide: AuthStore, useValue: { user, session: () => null } },
    ] });
    fixture = TestBed.createComponent(InstallationMaintenanceStatusComponent);
    fixture.componentRef.setInput('house', maintenanceHouse); fixture.detectChanges();
  });

  it('changes the state once and emits the refreshed installation', () => {
    const pending = new Subject<{ data: PoultryHouseDetail }>(); update.mockReturnValue(pending);
    const changed = vi.fn(); fixture.componentInstance.changed.subscribe(changed);
    fixture.componentInstance.toggle(); fixture.componentInstance.toggle();
    expect(update).toHaveBeenCalledExactlyOnceWith(22, 'maintenance');
    pending.next({ data: { ...maintenanceHouse, status: 'maintenance' } });
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ id: 22, status: 'maintenance' }));
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('restores an operational plant and blocks restoration in an inactive unit', () => {
    fixture.componentRef.setInput('house', { ...maintenanceHouse, type: 'feed', status: 'maintenance' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Marcar como operativa');
    fixture.componentInstance.toggle(); expect(update).toHaveBeenCalledWith(22, 'operational');
    update.mockClear();
    fixture.componentRef.setInput('house', { ...maintenanceHouse, status: 'maintenance', production_unit: { ...maintenanceHouse.production_unit, status: 'inactive' } }); fixture.detectChanges();
    fixture.componentInstance.toggle(); expect(update).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('debe estar activa');
  });

  it('shows errors, requests refresh on conflicts and hides actions without manage permission', () => {
    const refresh = vi.fn(); fixture.componentInstance.refreshRequested.subscribe(refresh);
    update.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'El estado cambió.' } })));
    fixture.componentInstance.toggle(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('El estado cambió.'); expect(refresh).toHaveBeenCalledOnce();
    user.set({ ...maintenanceUser, roles: [], permissions: ['poultry-houses.view'] }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ion-button')).toBeNull();
    update.mockClear(); fixture.componentInstance.toggle(); expect(update).not.toHaveBeenCalled();
  });
});
