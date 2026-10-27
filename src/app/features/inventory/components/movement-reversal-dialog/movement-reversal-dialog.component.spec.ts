import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { InventoryMovement } from '../../interfaces/inventory';
import { InventoryApi } from '../../services/inventory.api';
import { MovementReversalDialogComponent } from './movement-reversal-dialog.component';

const movement: InventoryMovement = { id: 11, operation_id: 'op-11', type: 'receipt', reference_type: null,
  reference_id: null, reason: 'Ingreso original', occurred_at: '2026-10-26T12:00:00Z', created_by: 3,
  created_by_name: 'Responsable original', reverses_movement_id: null, created_at: '2026-10-26T12:00:00Z',
  lines: [{ id: 2, product_id: 4, stock_location_id: 8, unit: 'kg', physical_delta: '12.5' }] };

describe('MovementReversalDialogComponent', () => {
  let fixture: ComponentFixture<MovementReversalDialogComponent>;
  let restore: () => void;
  const reverse = vi.fn(); const detail = vi.fn();
  const user = signal({ id: 1, permissions: ['inventory.adjust'] });
  beforeEach(() => {
    restore = stubNativeDialog(); vi.resetAllMocks(); user.set({ id: 1, permissions: ['inventory.adjust'] });
    reverse.mockReturnValue(of({ data: { ...movement, id: 12, type: 'reversal', reverses_movement_id: 11 } }));
    detail.mockReturnValue(of({ data: movement }));
    TestBed.configureTestingModule({ imports: [MovementReversalDialogComponent], providers: [
      { provide: AuthStore, useValue: { isAdmin: () => false, user } },
      { provide: InventoryApi, useValue: { movement: detail, reverse } },
    ] });
    fixture = TestBed.createComponent(MovementReversalDialogComponent);
    fixture.componentRef.setInput('productNames', { 4: 'Alimento' });
    fixture.componentRef.setInput('locationNames', { 8: 'Depósito' }); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); restore(); });

  function open(record = movement, trigger: HTMLElement | null = null) {
    fixture.componentInstance.open(record, 'Ingreso', trigger); fixture.detectChanges();
    return fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  }
  function review(reason = 'Registro duplicado') {
    fixture.componentInstance.form.controls.reason.setValue(reason); fixture.componentInstance.review(); fixture.detectChanges();
  }

  it('opens a closed modal, focuses its reason and cancels without posting, restoring focus', async () => {
    const trigger = document.createElement('button'); document.body.appendChild(trigger);
    const dialog = open(movement, trigger); await fixture.whenStable();
    expect(dialog.open).toBe(true); expect(document.activeElement?.id).toBe('movement-reversal-reason');
    expect(dialog.textContent).toContain('Responsable original'); expect(dialog.textContent).toContain('Alimento');
    expect(dialog.textContent).toContain('Depósito'); expect(detail).not.toHaveBeenCalled();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(false); expect(document.activeElement).toBe(trigger); expect(reverse).not.toHaveBeenCalled();
    trigger.remove();
  });

  it('requires a nonblank bounded reason and an explicit confirmation before posting', async () => {
    open(); await fixture.componentInstance.confirm(); expect(reverse).not.toHaveBeenCalled();
    review('   '); expect(fixture.componentInstance.step()).toBe('reason');
    review('x'.repeat(256)); expect(fixture.componentInstance.step()).toBe('reason');
    review('  Corrección válida  '); expect(fixture.componentInstance.step()).toBe('confirmation');
    expect(reverse).not.toHaveBeenCalled(); expect(fixture.nativeElement.textContent).toContain('¿Confirmás');
    fixture.componentInstance.form.controls.reason.setValue('Edición posterior');
    await fixture.componentInstance.confirm();
    expect(reverse).toHaveBeenCalledWith(11, 'Corrección válida', expect.any(String));
  });

  it('locks duplicate submissions, close and editing until success and emits once', async () => {
    const pending = new Subject<{ data: InventoryMovement }>(); reverse.mockReturnValue(pending);
    const emitted = vi.fn(); fixture.componentInstance.reversed.subscribe(emitted);
    const dialog = open(); review(); const saving = fixture.componentInstance.confirm();
    fixture.detectChanges(); fixture.componentInstance.close(); fixture.componentInstance.editReason();
    await fixture.componentInstance.confirm();
    expect(dialog.open).toBe(true); expect(fixture.componentInstance.step()).toBe('confirmation'); expect(reverse).toHaveBeenCalledOnce();
    expect(Array.from(dialog.querySelectorAll('button')).every((button) => button.disabled)).toBe(true);
    pending.next({ data: { ...movement, id: 12, type: 'reversal' } }); await saving; fixture.detectChanges();
    expect(dialog.open).toBe(false); expect(emitted).toHaveBeenCalledOnce();
    await fixture.componentInstance.confirm(); expect(reverse).toHaveBeenCalledOnce();
  });

  it('keeps network errors in the confirmation and retries with the same request and key after reopening', async () => {
    reverse.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    open(); review(); await fixture.componentInstance.confirm(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('conectar');
    fixture.componentInstance.close(); open(); expect(fixture.componentInstance.form.controls.reason.value).toBe('Registro duplicado');
    fixture.componentInstance.review(); await fixture.componentInstance.confirm();
    expect(reverse.mock.calls[1]).toEqual(reverse.mock.calls[0]);
    fixture.componentInstance.editReason(); review('Otro motivo'); await fixture.componentInstance.confirm();
    expect(reverse.mock.calls[2][2]).not.toBe(reverse.mock.calls[0][2]);
  });

  it('loads complete lines from a list row and blocks review until that lookup succeeds', async () => {
    detail.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    open({ ...movement, lines: undefined }); await fixture.whenStable(); fixture.detectChanges(); review();
    expect(fixture.componentInstance.step()).toBe('reason'); expect(reverse).not.toHaveBeenCalled();
    await fixture.componentInstance.loadDetails(); fixture.detectChanges(); review();
    expect(detail).toHaveBeenCalledWith(11); expect(fixture.componentInstance.lines()).toHaveLength(1);
    expect(fixture.componentInstance.step()).toBe('confirmation');
  });

  it('ignores late detail responses after cancellation and another movement is opened', async () => {
    const pending = new Subject<{ data: InventoryMovement }>(); detail.mockReturnValueOnce(pending);
    open({ ...movement, lines: undefined }); fixture.componentInstance.close(); open({ ...movement, id: 20 });
    pending.next({ data: movement }); await fixture.whenStable();
    expect(fixture.componentInstance.movement()?.id).toBe(20); expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('keeps server conflicts inside the modal without reporting success', async () => {
    reverse.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'El movimiento ya fue revertido.' } })));
    const emitted = vi.fn(); fixture.componentInstance.reversed.subscribe(emitted);
    const dialog = open(); review(); await fixture.componentInstance.confirm(); fixture.detectChanges();
    expect(dialog.open).toBe(true); expect(fixture.componentInstance.error()).toContain('ya fue revertido'); expect(emitted).not.toHaveBeenCalled();
  });

  it('checks permissions and actor changes before mutation', async () => {
    user.set({ id: 1, permissions: [] }); expect(open().open).toBe(false);
    user.set({ id: 1, permissions: ['inventory.adjust'] }); open(); review();
    user.set({ id: 2, permissions: ['inventory.adjust'] }); await fixture.componentInstance.confirm();
    expect(reverse).not.toHaveBeenCalled(); expect(fixture.componentInstance.error()).toContain('sesión cambió');
  });
});
