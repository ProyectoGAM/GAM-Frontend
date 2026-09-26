import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { EggStockTransaction } from '../../interfaces/inventory';
import { EggStockApi } from '../../services/egg-stock.api';
import { EggMovementDetailPage } from './egg-movement-detail.page';
import { stubNativeDialog } from '../../testing/native-dialog-test';

const movement = (type: EggStockTransaction['type'] = 'manual_receipt'): EggStockTransaction => ({
  id: 'egg-movement-secret-id',
  production_unit_id: 19,
  type,
  quantity: 7,
  occurred_at: '2026-01-01T10:00:00Z',
  reason: 'Conteo inicial',
  notes: null,
  status: 'recorded',
  version: 4,
  reference: type === 'collection_receipt' ? { type: 'egg_collection', id: 'collection-secret-id' } : null,
  revisions: [{
    id: 'revision-secret-id', action: 'correct', before: { quantity: 5 }, after: { quantity: 7 },
    correction_reason: 'Se verificó el conteo', operation_id: 'operation-secret-id', created_by: 12,
    created_at: '2026-01-02T10:00:00Z',
  }],
});

describe('Egg movement detail', () => {
  const createFixture = async (item: EggStockTransaction = movement()) => {
    const correct = vi.fn().mockReturnValue(of({ data: { transaction: item.id } }));
    const cancel = vi.fn().mockReturnValue(of({ data: { transaction: item.id } }));
    const fixtureSetup = await TestBed.configureTestingModule({
      imports: [EggMovementDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => item.id } } } },
        { provide: AuthStore, useValue: { isAdmin: () => false, user: () => ({ permissions: ['egg-stock.adjust'] }) } },
        { provide: EggStockApi, useValue: { movement: () => of({ data: item }), correct, cancel } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EggMovementDetailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, correct, cancel };
  };

  it('shows current and corrected quantities, requires a reason, and hides technical identifiers', async () => {
    const { fixture, correct } = await createFixture();
    const page = fixture.componentInstance;
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Cantidad actual registrada');
    expect(text).toContain('Cantidad: 5 huevos → 7 huevos');
    expect(page.correctionForm.controls.quantity.value).toBe('');
    expect(text).not.toContain('egg-movement-secret-id');
    expect(text).not.toContain('operation-secret-id');
    expect(text).not.toContain('revision-secret-id');
    expect(text).not.toContain('Versión');

    page.correctionForm.controls.correction_reason.setValue('');
    await page.correct();
    expect(correct).not.toHaveBeenCalled();

    page.correctionForm.controls.quantity.setValue('9');
    page.correctionForm.controls.correction_reason.setValue('Conteo doble verificado');
    await page.correct();
    expect(correct).toHaveBeenCalledWith('egg-movement-secret-id', expect.objectContaining({
      version: 4, quantity: 9, correction_reason: 'Conteo doble verificado',
    }), expect.any(String));
    fixture.destroy();
  });

  it('cancels without an API call, retains the reason, and sends the existing payload on confirm', async () => {
    const restoreDialog = stubNativeDialog();
    try {
      const { fixture, cancel } = await createFixture();
      const page = fixture.componentInstance;
      page.selectAction('cancel');
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('El registro original permanecerá en el historial');
      page.cancellationForm.controls.correction_reason.setValue('Registro duplicado');
      fixture.detectChanges();
      const opener = fixture.nativeElement.querySelector('.action-form button[type="submit"]') as HTMLButtonElement;

      opener.click();
      fixture.detectChanges();
      let dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
      expect(dialog.textContent).toContain('Registro duplicado');
      (dialog.querySelector('button.secondary') as HTMLButtonElement).click();
      expect(dialog.open).toBe(false);
      expect(cancel).not.toHaveBeenCalled();
      expect(page.cancellationForm.controls.correction_reason.value).toBe('Registro duplicado');

      opener.click();
      fixture.detectChanges();
      dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
      (dialog.querySelector('button.danger') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledWith('egg-movement-secret-id', { version: 4, correction_reason: 'Registro duplicado' }, expect.any(String));
      expect(dialog.open).toBe(false);
      expect(page.success()).toContain('Movimiento cancelado');
      fixture.destroy();
    } finally {
      restoreDialog();
    }
  });

  it('keeps the cancellation dialog open on API error and preserves its reason', async () => {
    const restoreDialog = stubNativeDialog();
    try {
      const { fixture, cancel } = await createFixture();
      cancel.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      fixture.componentInstance.selectAction('cancel');
      fixture.componentInstance.cancellationForm.controls.correction_reason.setValue('Motivo válido');
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.action-form button[type="submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('dialog button.danger') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
      expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar con el servidor');
      expect(fixture.componentInstance.cancellationForm.controls.correction_reason.value).toBe('Motivo válido');
      fixture.destroy();
    } finally {
      restoreDialog();
    }
  });
  it('keeps production-generated receipts read-only', async () => {
    const { fixture } = await createFixture(movement('collection_receipt'));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('se generó al registrar la producción');
    expect(fixture.nativeElement.querySelector('.actions')).toBeNull();
    expect(text).not.toContain('collection-secret-id');
    fixture.destroy();
  });
});
