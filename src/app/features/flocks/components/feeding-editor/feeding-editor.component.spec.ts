import { TestBed } from '@angular/core/testing';

import { FeedingEditorComponent } from './feeding-editor.component';

describe('FeedingEditorComponent', () => {
  const setup = (correction = false) => {
    const fixture = TestBed.createComponent(FeedingEditorComponent);
    fixture.componentRef.setInput('correction', correction);
    fixture.componentRef.setInput('context', 'Lote 1');
    fixture.componentRef.setInput('currentQuantity', '12000');
    fixture.componentRef.setInput('currentRecipe', 'Inicio');
    fixture.componentRef.setInput('state', 'ready');
    fixture.componentRef.setInput('options', [{ id: 1, name: 'Inicio', balance: '10000', inactive: false }]);
    const submitted = vi.spyOn(fixture.componentInstance.submitted, 'emit');
    return { fixture, editor: fixture.componentInstance, submitted };
  };

  it('supports a quantity-only change in exact grams even when recipe stock cannot load', () => {
    const { fixture, editor, submitted } = setup();
    fixture.componentRef.setInput('state', 'error');
    editor.form.controls.quantity.setValue('12,345'); editor.submit();
    expect(submitted).toHaveBeenCalledWith({ mode: 'manual', recipeId: null, grams: '12345', reason: '' });
  });

  it('supports a recipe-only change while preserving the current amount', () => {
    const { editor, submitted } = setup();
    editor.form.controls.recipe.setValue('1'); editor.submit();
    expect(submitted).toHaveBeenCalledWith({ mode: 'manual', recipeId: 1, grams: null, reason: '' });
  });

  it('requires a change and a nonblank correction reason, and permits correcting consumption to zero', () => {
    const { editor, submitted } = setup(true);
    editor.submit(); expect(submitted).not.toHaveBeenCalled();
    editor.form.patchValue({ quantity: '0', reason: '   ' }); editor.submit();
    expect(submitted).not.toHaveBeenCalled();
    editor.form.controls.reason.setValue(' Error de captura '); editor.submit();
    expect(submitted).toHaveBeenCalledWith({ recipeId: null, grams: '0', reason: 'Error de captura' });
  });

  it('rejects zero for the current daily amount, fractional grams and unavailable recipes', () => {
    const { editor, submitted } = setup();
    for (const quantity of ['0', '0,0001', '-1', '1000000000']) { editor.form.controls.quantity.setValue(quantity); editor.submit(); }
    editor.form.patchValue({ quantity: '1', recipe: '999' }); editor.submit();
    expect(submitted).not.toHaveBeenCalled();
  });

  it('starts in the current mode and does not submit unchanged automatic configuration', () => {
    const { fixture, editor, submitted } = setup();
    fixture.componentRef.setInput('currentMode', 'automatico');
    expect(editor.mode()).toBe('automatico'); expect(editor.automatic()).toBe(true);
    editor.submit(); expect(submitted).not.toHaveBeenCalled();
    editor.changeMode('manual'); expect(editor.mode()).toBe('manual');
    expect(editor.automatic()).toBe(false);
    expect(editor.quantityPlaceholder()).toBe('Conservar cantidad actual (12 kg)');
  });

  it('returns to automatic without confirmation or including stale manual fields', () => {
    const { editor, submitted } = setup();
    editor.form.patchValue({ recipe: '999', quantity: 'invalid', reason: 'unused' });
    editor.changeMode('automatico'); editor.submit();
    expect(submitted).toHaveBeenCalledWith({ mode: 'automatico', recipeId: null, grams: null, reason: '' });
    expect(editor.pending()).toBeNull();
  });

  it('confirms only automatic to manual, allows cancel, and submits the reviewed amount once', () => {
    const { fixture, editor, submitted } = setup();
    fixture.componentRef.setInput('currentMode', 'automatico');
    editor.changeMode('manual'); editor.form.controls.quantity.setValue('20,125');
    const dialog = document.createElement('dialog');
    dialog.showModal = vi.fn(() => { dialog.open = true; });
    dialog.close = vi.fn(() => { dialog.open = false; });
    editor.submit(dialog);
    expect(dialog.showModal).toHaveBeenCalledOnce(); expect(submitted).not.toHaveBeenCalled();
    expect(editor.confirmationQuantity()).toBe('20,125');
    editor.submit(dialog); expect(dialog.showModal).toHaveBeenCalledOnce();
    editor.cancelConfirmation(); expect(dialog.open).toBe(false); expect(editor.pending()).toBeNull();
    expect(editor.form.controls.quantity.value).toBe('20,125'); expect(submitted).not.toHaveBeenCalled();
    editor.submit(dialog); editor.confirmManual(); editor.confirmManual();
    expect(submitted).toHaveBeenCalledExactlyOnceWith({ mode: 'manual', recipeId: null, grams: '20125', reason: '' });
    expect(dialog.open).toBe(false);
  });

  it('freezes the exact displayed current amount when confirming a recipe-only switch to manual', () => {
    const { fixture, editor, submitted } = setup();
    fixture.componentRef.setInput('currentMode', 'automatico');
    fixture.componentRef.setInput('currentQuantity', '1234567');
    editor.changeMode('manual'); editor.form.controls.recipe.setValue('1');
    editor.submit(); expect(editor.confirmationQuantity()).toBe('1.234,567');
    editor.confirmManual();
    expect(submitted).toHaveBeenCalledWith({ mode: 'manual', recipeId: 1, grams: '1234567', reason: '' });
  });

  it('discards an open confirmation on destruction and cannot submit after its parent requests closure', () => {
    const { fixture, editor, submitted } = setup();
    fixture.componentRef.setInput('currentMode', 'automatico');
    editor.changeMode('manual'); editor.form.controls.quantity.setValue('20');
    const dialog = document.createElement('dialog');
    dialog.showModal = vi.fn(() => { dialog.open = true; });
    dialog.close = vi.fn(() => { dialog.open = false; });
    editor.submit(dialog); expect(dialog.open).toBe(true);
    fixture.componentRef.setInput('open', false);
    editor.confirmManual(); expect(submitted).not.toHaveBeenCalled();
    fixture.destroy(); expect(dialog.open).toBe(false);
  });
});
