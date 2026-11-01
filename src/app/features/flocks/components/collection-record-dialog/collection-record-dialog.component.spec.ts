import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { CollectionOperation, FlockCollection } from '../../interfaces/flock-collection.interface';
import { Flock } from '../../interfaces/flock.interface';
import { FlockCollectionsService } from '../../services/flock-collections.service';
import { CollectionRecordDialogComponent } from './collection-record-dialog.component';

const flock: Flock = { id: 'flock', code: 'L-1', breed_id: 1, supplier_id: null, supplier_name: null, origin: null,
  poultry_house_id: 1, production_unit_id: 1, initial_quantity: 100, current_quantity: 90, entry_date: '2020-01-01',
  established_at: '2020-01-01T12:00:00Z', age_days: 30, current_week: 5, is_grouped: false, status: 'active',
  version: 1, notes: null, finalized_at: null, finalization_reason: null };
const record: FlockCollection = { id: 'record', flock_id: 'flock', quantity: 400, occurred_at: '2020-01-02T16:40:35-03:00',
  version: 3, notes: 'Notas originales', status: 'recorded' };
describe('Collection detail actions', () => {
  let fixture: ComponentFixture<CollectionRecordDialogComponent>; let restore: () => void;
  const api = { collection: vi.fn(), correct: vi.fn(), cancel: vi.fn() };
  const user = signal({ id: 1, roles: ['admin'], permissions: [] as string[] });
  const session = signal({ id: 'session-1' });
  beforeEach(() => {
    vi.resetAllMocks(); restore = stubNativeDialog();
    user.set({ id: 1, roles: ['admin'], permissions: [] }); session.set({ id: 'session-1' });
    api.collection.mockReturnValue(of(record));
    api.correct.mockReturnValue(of({ operation_id: 'op', collection: { ...record, quantity: 450, version: 4 } }));
    api.cancel.mockReturnValue(of({ operation_id: 'op', collection: { ...record, status: 'cancelled', version: 4 } }));
    TestBed.configureTestingModule({ imports: [CollectionRecordDialogComponent], providers: [
      { provide: FlockCollectionsService, useValue: api },
      { provide: AuthStore, useValue: { user, session, isAdmin: () => user().roles.includes('admin') } },
    ] });
    fixture = TestBed.createComponent(CollectionRecordDialogComponent); fixture.componentRef.setInput('flock', flock); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); restore(); });
  const component = () => fixture.componentInstance;
  function open() { component().open(record); fixture.detectChanges(); }
  function edit() { open(); component().start('edit'); fixture.detectChanges(); }
  function fill(quantity = 450) { component().form.patchValue({ quantity, reason: 'Corregir captura' }); }

  it('refreshes current data before enabling actions and never mutates when viewing or cancelling', () => {
    const pending = new Subject<FlockCollection>(); api.collection.mockReturnValue(pending);
    open(); expect(component().canChange()).toBe(false);
    component().start('edit'); expect(component().mode()).toBe('detail');
    pending.next({ ...record, version: 8 }); fixture.detectChanges();
    expect(component().canChange()).toBe(true);
    component().start('delete'); component().close();
    expect(api.correct).not.toHaveBeenCalled(); expect(api.cancel).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
  });
  it('edits only changed fields with the current version and preserves seconds when the date is unchanged', () => {
    edit(); fill(); component().submit();
    expect(api.correct).toHaveBeenCalledWith('record', { version: 3, correction_reason: 'Corregir captura', quantity: 450 }, expect.any(String));
    expect(api.correct.mock.calls[0][1]).not.toHaveProperty('occurred_at');
    expect(component().record()?.quantity).toBe(450); expect(component().mode()).toBe('detail');
  });
  it('converts changed Uruguay times with an explicit offset and supports clearing notes on finished lots', () => {
    fixture.componentRef.setInput('flock', { ...flock, status: 'finished', current_quantity: 0 }); fixture.detectChanges();
    edit(); component().form.patchValue({ occurredAt: '2020-01-02T15:00', notes: '', reason: 'Corregir datos' }); component().submit();
    expect(api.correct).toHaveBeenCalledWith('record', { version: 3, correction_reason: 'Corregir datos', occurred_at: '2020-01-02T15:00:00-03:00', notes: null }, expect.any(String));
  });
  it('requires a reason, valid quantity, an actual change and a valid business date', () => {
    edit(); component().submit(); expect(api.correct).not.toHaveBeenCalled();
    fill(0); component().submit(); expect(api.correct).not.toHaveBeenCalled();
    fill(400); component().submit(); expect(component().error()).toContain('Modificá al menos');
    component().form.patchValue({ occurredAt: '2019-01-01T12:00' }); component().submit();
    expect(component().fieldErrors()['occurred_at']).toBeTruthy(); expect(api.correct).not.toHaveBeenCalled();
  });
  it('confirms a logical cancellation with reason and preserves the cancelled record in the detail', () => {
    const changed = vi.fn(); component().changed.subscribe(changed); open(); component().start('delete');
    component().submit(); expect(api.cancel).not.toHaveBeenCalled();
    component().form.controls.reason.setValue('Registro duplicado'); component().submit(); fixture.detectChanges();
    expect(api.cancel).toHaveBeenCalledWith('record', { version: 3, correction_reason: 'Registro duplicado' }, expect.any(String));
    expect(changed).toHaveBeenCalledWith('deleted');
    expect(fixture.nativeElement.textContent).toContain('Cancelada');
    expect(component().canChange()).toBe(false);
  });
  it('locks duplicate submissions and closing while pending, then emits one change', () => {
    const pending = new Subject<CollectionOperation>(); api.correct.mockReturnValue(pending);
    const changed = vi.fn(); component().changed.subscribe(changed); edit(); fill(); component().submit(); component().submit(); component().close();
    expect(api.correct).toHaveBeenCalledOnce(); expect(fixture.nativeElement.querySelector('dialog').open).toBe(true);
    pending.next({ operation_id: 'op', collection: { ...record, quantity: 450, version: 4 } }); fixture.detectChanges();
    expect(changed).toHaveBeenCalledOnce(); expect(component().saving()).toBe(false);
  });
  it('reuses a key for identical network retries and replaces it when the payload changes', () => {
    api.correct.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    edit(); fill(); component().submit(); component().submit();
    expect(api.correct.mock.calls[1]).toEqual(api.correct.mock.calls[0]);
    fill(451); component().submit();
    expect(api.correct.mock.calls[2][2]).not.toBe(api.correct.mock.calls[0][2]);
  });
  it('refreshes a conflict without reporting success or retrying automatically', () => {
    const changed = vi.fn(); const refresh = vi.fn(); component().changed.subscribe(changed); component().refreshRequested.subscribe(refresh);
    api.correct.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'La postura cambió de versión.' } })));
    edit(); fill(); api.collection.mockReturnValue(of({ ...record, version: 5 })); component().submit();
    expect(api.correct).toHaveBeenCalledOnce(); expect(changed).not.toHaveBeenCalled(); expect(refresh).toHaveBeenCalledOnce();
    expect(component().record()?.version).toBe(5); expect(component().mode()).toBe('detail');
    expect(component().error()).toContain('cambió de versión');
  });
  it('keeps validation feedback and prevents changes for read-only users or after a session change', () => {
    api.correct.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { quantity: ['Cantidad inválida'] } } })));
    edit(); fill(); component().submit(); expect(component().fieldErrors()['quantity']).toBe('Cantidad inválida');
    session.set({ id: 'session-2' }); component().submit(); expect(api.correct).toHaveBeenCalledOnce(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
    user.set({ id: 2, roles: [], permissions: ['egg-collections.view'] }); fixture.detectChanges(); open();
    expect(component().canManage()).toBe(false); component().start('delete'); expect(component().mode()).toBe('detail');
  });
});
