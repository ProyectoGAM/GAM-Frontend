import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { UsersService } from '../../../users/services/users.service';
import { InstallationMaintenanceService } from '../../services/installation-maintenance.service';
import { maintenanceHouse, maintenanceRecord, maintenanceUser } from '../../testing/maintenance-fixtures';
import { InstallationMaintenance } from '../../interfaces/installation-maintenance.interface';
import { MaintenanceRecordDialogComponent } from './maintenance-record-dialog.component';

describe('MaintenanceRecordDialogComponent', () => {
  let fixture: ComponentFixture<MaintenanceRecordDialogComponent>;
  let component: MaintenanceRecordDialogComponent;
  let restoreDialog: () => void;
  let create: ReturnType<typeof vi.fn>;
  let correct: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;
  let detail: ReturnType<typeof vi.fn>;
  let allUsers: ReturnType<typeof vi.fn>;
  const user = signal(maintenanceUser);

  beforeEach(() => {
    restoreDialog = stubNativeDialog(); user.set(maintenanceUser);
    create = vi.fn().mockReturnValue(of(maintenanceRecord)); correct = vi.fn().mockReturnValue(of(maintenanceRecord));
    cancel = vi.fn().mockReturnValue(of({ ...maintenanceRecord, status: 'cancelled', version: 4, cancellation_reason: 'Duplicado' }));
    detail = vi.fn().mockReturnValue(of(maintenanceRecord));
    allUsers = vi.fn().mockResolvedValue([maintenanceUser, { ...maintenanceUser, id: 2, name: 'Laura Rodríguez' }, { ...maintenanceUser, id: 3, name: 'Inactivo', deleted_at: '2026-01-01' }]);
    TestBed.configureTestingModule({ imports: [MaintenanceRecordDialogComponent], providers: [
      { provide: AuthStore, useValue: { user, session: () => null } },
      { provide: InstallationMaintenanceService, useValue: { create, correct, cancel, detail } },
      { provide: UsersService, useValue: { allUsers } },
    ] });
    fixture = TestBed.createComponent(MaintenanceRecordDialogComponent); fixture.componentRef.setInput('house', maintenanceHouse);
    component = fixture.componentInstance; fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); restoreDialog(); });

  function fill(): void { component.form.patchValue({ description: ' Limpieza de bebederos ', cost: '0' }); }

  it('defaults to the logged-in responsible, marks eres tú, excludes inactive users and saves zero cost', async () => {
    component.openCreate(); fill(); await fixture.whenStable(); fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#maintenance-responsible');
    expect(select.selectedOptions[0].textContent).toContain('Martín Pérez (eres tú)');
    expect(select.textContent).toContain('Laura Rodríguez'); expect(select.textContent).not.toContain('Inactivo');
    component.submit();
    expect(create).toHaveBeenCalledWith(22, expect.objectContaining({ cost_amount: '0.00', cost_currency: 'UYU', description: 'Limpieza de bebederos', responsible_user_id: 1 }), expect.any(String));
    expect(component.mode()).toBe('detail'); expect(component.record()?.id).toBe(9);
  });

  it('shows the full individual record with installation, unit and registration timestamps', () => {
    const full = { ...maintenanceRecord, description: 'Trabajo realizado.\nDetalle completo del trabajo sin truncar.' };
    detail.mockReturnValue(of(full)); component.openRecord(full); fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('dialog').textContent;
    expect(text).toContain('#9'); expect(text).toContain('Galpón Norte'); expect(text).toContain('San José');
    expect(text).toContain(full.description); expect(text).toContain('Martín Pérez');
    expect(text).toContain('Registrado el (Uruguay)'); expect(text).toContain('Última actualización (Uruguay)');
    expect(text).toContain('02 ene. 2026'); expect(text).toContain('09:00');
  });

  it('keeps the current user available if directory access is denied', async () => {
    allUsers.mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    component.openCreate(); await fixture.whenStable(); fixture.detectChanges(); fill();
    expect(component.responsibles()).toEqual([{ id: 1, name: 'Martín Pérez' }]);
    expect(component.directoryMessage()).toContain('No se pudo consultar'); component.submit(); expect(create).toHaveBeenCalledOnce();
  });

  it('rejects negative costs, too many decimals and future dates', () => {
    component.openCreate(); fill();
    component.form.controls.cost.setValue('-1'); component.submit();
    component.form.controls.cost.setValue('1.001'); component.submit();
    component.form.patchValue({ cost: '0', date: '2999-01-01' }); component.submit();
    expect(create).not.toHaveBeenCalled();
  });

  it('reuses the creation key after a lost response and prevents double submission and closing while saving', () => {
    const pending = new Subject<InstallationMaintenance>(); create.mockReturnValue(pending);
    component.openCreate(); fill(); component.submit(); component.submit(); component.close();
    expect(create).toHaveBeenCalledOnce(); expect(component.opened()).toBe(true);
    const key = create.mock.calls[0][2]; pending.error(new HttpErrorResponse({ status: 0 }));
    create.mockReturnValue(of(maintenanceRecord)); component.submit(); expect(create.mock.calls[1][2]).toBe(key);
  });

  it('requires a reason and sends only corrected values with the latest version', () => {
    component.openRecord(maintenanceRecord); component.start('edit');
    component.form.controls.description.setValue('Reparación de bebederos'); component.submit();
    expect(correct).not.toHaveBeenCalled(); expect(component.fieldErrors()['reason']).toBeTruthy();
    component.form.controls.reason.setValue('Descripción incompleta'); component.submit();
    expect(correct).toHaveBeenCalledExactlyOnceWith(9, { version: 3, reason: 'Descripción incompleta', description: 'Reparación de bebederos' });
  });

  it('annuls a record with a reason and preserves it as cancelled without a delete request', () => {
    const changed = vi.fn(); component.changed.subscribe(changed);
    component.openRecord(maintenanceRecord); component.start('cancel'); component.form.controls.reason.setValue('Duplicado'); component.submit(); fixture.detectChanges();
    expect(cancel).toHaveBeenCalledExactlyOnceWith(9, { version: 3, reason: 'Duplicado' });
    expect(component.record()?.status).toBe('cancelled'); expect(component.canEdit()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Motivo de anulación'); expect(changed).toHaveBeenCalledWith(expect.stringContaining('historial se conserva'));
  });

  it('refreshes the record on a version conflict before permitting another correction', () => {
    correct.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'La versión cambió.' } })));
    component.openRecord(maintenanceRecord); component.start('edit'); component.form.patchValue({ description: 'Nueva descripción', reason: 'Corrección' });
    detail.mockReturnValue(of({ ...maintenanceRecord, version: 4 })); component.submit();
    expect(component.mode()).toBe('detail'); expect(component.record()?.version).toBe(4); expect(component.error()).toBe('La versión cambió.');
  });

  it('closes and discards stale responses when the logged-in user changes', () => {
    const pending = new Subject<InstallationMaintenance>(); create.mockReturnValue(pending);
    component.openCreate(); fill(); component.submit(); user.set({ ...maintenanceUser, id: 4 }); fixture.detectChanges();
    pending.next(maintenanceRecord); expect(component.opened()).toBe(false); expect(component.record()).toBeNull(); expect(component.form.controls.description.value).toBe('');
  });

  it('restores focus when closing and offers no mutation to a read-only user', () => {
    const trigger = document.createElement('button'); document.body.append(trigger);
    component.openRecord(maintenanceRecord, trigger); component.close(); expect(document.activeElement).toBe(trigger); trigger.remove();
    user.set({ ...maintenanceUser, roles: [], permissions: ['poultry-houses.view'] }); fixture.detectChanges();
    component.openRecord(maintenanceRecord); component.start('edit'); expect(component.mode()).toBe('detail');
    component.openCreate(); expect(create).not.toHaveBeenCalled();
  });
});
