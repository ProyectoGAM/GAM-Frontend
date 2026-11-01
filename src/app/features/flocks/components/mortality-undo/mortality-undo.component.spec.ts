import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { Flock } from '../../interfaces/flock.interface';
import { FlockMortality, MortalityOperation } from '../../interfaces/flock-mortality.interface';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockMortalitiesService } from '../../services/flock-mortalities.service';
import { FlockMortalitySectionComponent } from '../flock-mortality-section/flock-mortality-section.component';
import { MortalityUndoComponent } from './mortality-undo.component';

const flock = { id: '01J00000000000000000000000', code: 'Lote histórico', status: 'active', current_quantity: 94, version: 7 } as Flock;
const record: FlockMortality = { id: '01K8Y2N7AA2XQY0YQEBMWVFJ9G', version: 3, quantity: 6,
  occurred_at: '2026-10-31T05:48:11Z', notes: 'Ruido fuerte', status: 'recorded' };
const operation = { mortality: { ...record, status: 'cancelled' } } as MortalityOperation;

describe('Mortality undo over audit detail', () => {
  let fixture: ComponentFixture<MortalityUndoComponent>;
  let component: MortalityUndoComponent;
  let restore: () => void;
  const session = signal({ id: 'session-1' });
  const auth = { user: () => ({ id: 1 }), session, status: () => 'personal_authenticated' };
  const detail = { flock: vi.fn() };
  const api = { list: vi.fn(), cancel: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks(); session.set({ id: 'session-1' }); restore = stubNativeDialog();
    detail.flock.mockReturnValue(of(flock)); api.list.mockReturnValue(of([record])); api.cancel.mockReturnValue(of(operation));
    TestBed.configureTestingModule({ imports: [MortalityUndoComponent], providers: [
      { provide: AuthStore, useValue: auth }, { provide: FlockDetailService, useValue: detail },
      { provide: FlockMortalitiesService, useValue: api },
    ] });
    fixture = TestBed.createComponent(MortalityUndoComponent); component = fixture.componentInstance; fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); restore(); });
  async function settle() { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  async function open() { await component.open(flock.id, record.id, null); await settle(); }
  const section = () => fixture.debugElement.query(By.directive(FlockMortalitySectionComponent)).componentInstance as FlockMortalitySectionComponent;
  const dialog = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('.cancellation-dialog')!;

  it('loads current data and reuses only the existing cancellation dialog without posting on open or cancel', async () => {
    await open();
    expect(detail.flock).toHaveBeenCalledWith(flock.id); expect(api.list).toHaveBeenCalledWith(flock.id);
    expect(dialog().open).toBe(true); expect(dialog().textContent).toContain('Lote histórico');
    expect(dialog().textContent).toContain('Ruido fuerte');
    expect(fixture.nativeElement.querySelector('.mortality-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-labelledby="mortality-form-title"]')).toBeNull();
    expect(api.cancel).not.toHaveBeenCalled();
    section().closeCancellation(); await settle();
    expect(component.isOpen()).toBe(false); expect(component.flock()).toBeNull(); expect(api.cancel).not.toHaveBeenCalled();
  });

  it('submits current versions and the required reason once, locks closing, then reports success', async () => {
    const pending = new Subject<MortalityOperation>(); api.cancel.mockReturnValue(pending);
    const undone = vi.fn(); component.undone.subscribe(undone);
    await open(); section().submitCancellation(); expect(api.cancel).not.toHaveBeenCalled();
    section().cancellationForm.controls.reason.setValue(' Registro duplicado '); section().submitCancellation(); await settle();
    section().submitCancellation(); section().closeCancellation(); component.close();
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith(record.id, { version: 3, flock_version: 7, reason: 'Registro duplicado' }, expect.any(String));
    expect(component.isOpen()).toBe(true); expect(dialog().open).toBe(true);
    pending.next(operation); pending.complete(); await settle();
    expect(component.isOpen()).toBe(false); expect(undone).toHaveBeenCalledOnce();
  });

  it('reuses the idempotency key for an uncertain retry and replaces it for a changed reason', async () => {
    api.cancel.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await open(); section().cancellationForm.controls.reason.setValue('Duplicado'); section().submitCancellation(); await settle();
    section().submitCancellation(); await settle();
    expect(api.cancel.mock.calls[1]).toEqual(api.cancel.mock.calls[0]);
    section().cancellationForm.controls.reason.setValue('Recuento corregido'); section().submitCancellation(); await settle();
    expect(api.cancel.mock.calls[2][2]).not.toBe(api.cancel.mock.calls[0][2]);
  });

  it.each([401, 403, 404, 409])('blocks another submit after HTTP %s while keeping the reason and allowing close', async (status) => {
    api.cancel.mockReturnValue(throwError(() => new HttpErrorResponse({ status, error: { detail: 'La versión cambió.' } })));
    const failed = vi.fn(); component.failed.subscribe(failed);
    await open(); section().cancellationForm.controls.reason.setValue('Duplicado'); section().submitCancellation(); await settle();
    expect(component.blocked()).toBe(true); expect(failed).toHaveBeenCalledWith(status);
    expect(section().cancellationForm.controls.reason.value).toBe('Duplicado');
    section().cancellationForm.controls.reason.setValue('Otro motivo'); section().submitCancellation(); await settle();
    expect(api.cancel).toHaveBeenCalledOnce(); expect(component.error()).not.toBeNull();
    section().closeCancellation(); await settle(); expect(component.isOpen()).toBe(false);
  });

  it('keeps validation errors beside the reason and requires confirmation to reactivate a finished flock', async () => {
    detail.flock.mockReturnValue(of({ ...flock, status: 'finished', current_quantity: 0 }));
    api.cancel.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { reason: ['Indica otro motivo.'] } } })));
    await open(); section().cancellationForm.controls.reason.setValue('Duplicado'); section().submitCancellation();
    expect(api.cancel).not.toHaveBeenCalled();
    section().cancellationForm.controls.reactivate.setValue(true); section().submitCancellation(); await settle();
    expect(api.cancel.mock.calls[0][1].confirm_reactivation).toBe(true);
    expect(dialog().textContent).toContain('Indica otro motivo.'); expect(component.blocked()).toBe(false);
  });

  it('discards an opening or a successful response after invalidation and a same-user session change', async () => {
    const pending = new Subject<FlockMortality[]>(); api.list.mockReturnValueOnce(pending);
    const opening = component.open(flock.id, record.id, null); component.invalidate();
    pending.next([record]); pending.complete(); await opening; await settle();
    expect(component.flock()).toBeNull();
    const mutation = new Subject<MortalityOperation>(); api.cancel.mockReturnValue(mutation);
    const undone = vi.fn(); component.undone.subscribe(undone);
    await open(); section().cancellationForm.controls.reason.setValue('Duplicado'); section().submitCancellation(); await settle();
    session.set({ id: 'session-2' }); await settle();
    expect(component.isOpen()).toBe(false);
    mutation.next(operation); mutation.complete(); await settle(); expect(undone).not.toHaveBeenCalled();
  });

  it('rejects records that are absent or come from a different flock before presenting confirmation', async () => {
    api.list.mockReturnValueOnce(of([]));
    await expect(component.open(flock.id, record.id, null)).rejects.toThrow('Mortalidad no disponible');
    expect(component.isOpen()).toBe(false);
    detail.flock.mockReturnValueOnce(of({ ...flock, id: 'another-flock' }));
    await expect(component.open(flock.id, record.id, null)).rejects.toThrow('Mortalidad no disponible');
    expect(api.cancel).not.toHaveBeenCalled();
  });
});
