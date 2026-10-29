import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { EggPresentationsApi } from '../../services/egg-presentations.api';
import { EggPresentationsPage } from './egg-presentations.page';
import { stubNativeDialog } from '../../testing/native-dialog-test';

const presentation = { id: 'maple', label: 'Maple', category: 'maples', eggs_per_unit: 30, default_unit_price: 101, currency: 'UYU' as const };

describe('EggPresentationsPage', () => {
  const api = { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() };
  let page: EggPresentationsPage;
  let restoreDialog: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    restoreDialog = stubNativeDialog();
    api.list.mockReturnValue(of({ data: [presentation], meta: { locked: false } }));
    api.create.mockReturnValue(of({ data: presentation }));
    api.update.mockReturnValue(of({ data: presentation }));
    api.remove.mockReturnValue(of(undefined));
    TestBed.configureTestingModule({ providers: [{ provide: EggPresentationsApi, useValue: api }] });
    page = TestBed.runInInjectionContext(() => new EggPresentationsPage());
    await page.load();
  });

  afterEach(() => restoreDialog());

  const createFixture = async () => {
    const fixture = TestBed.createComponent(EggPresentationsPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('creates in a separate modal while preserving an unfinished edit', async () => {
    const fixture = await createFixture();
    page.edit(presentation);
    page.form.controls.name.setValue('Maple actualizado');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.heading .actions button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = root.querySelector('.creation-dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(page.editing()).toBe('maple');
    expect(page.form.controls.name.value).toBe('Maple actualizado');
    expect(document.activeElement).toBe(root.querySelector('#creation-name'));
    expect(dialog.querySelector('button[type="submit"]')?.textContent).toContain('Crear presentación');
    for (const [id, value] of [['creation-name', 'Caja de 45 huevos'], ['creation-eggs', '45'], ['creation-price', '100']]) {
      const input = root.querySelector(`#${id}`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();
    const submit = dialog.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    submit.click();
    await fixture.whenStable();
    expect(api.create).toHaveBeenCalledWith({ name: 'Caja de 45 huevos', eggs_per_unit: 45, default_unit_price: 100 });
    expect(api.update).not.toHaveBeenCalled();
    expect(dialog.open).toBe(false);
    expect(page.editing()).toBe('maple');
    expect(page.form.controls.name.value).toBe('Maple actualizado');
    await page.save();
    expect(api.update).toHaveBeenCalledWith('maple', { name: 'Maple actualizado', eggs_per_unit: 30, default_unit_price: 101 });
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('cancels creation with Escape, restores focus and clears only the new form', async () => {
    const fixture = await createFixture();
    page.edit(presentation);
    page.form.controls.default_unit_price.setValue(90);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('.heading .actions button') as HTMLButtonElement;
    trigger.click();
    page.creationForm.controls.name.setValue('Creación pendiente');
    const dialog = root.querySelector('.creation-dialog') as HTMLDialogElement;
    const escape = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(page.editing()).toBe('maple');
    expect(page.form.controls.default_unit_price.value).toBe(90);
    expect(page.creationForm.controls.name.value).toBe('');
    expect(api.create).not.toHaveBeenCalled();
    trigger.click();
    expect(page.creationForm.controls.name.value).toBe('');
  });

  it('prevents duplicate creation and closing while a create request is pending', async () => {
    const fixture = await createFixture();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.heading .actions button') as HTMLButtonElement).click();
    page.creationForm.setValue({ name: 'Caja', eggs_per_unit: 45, default_unit_price: 100 });
    const response = new Subject<{ data: typeof presentation }>();
    api.create.mockReturnValue(response);
    const pending = page.create();
    fixture.detectChanges();
    const dialog = root.querySelector('.creation-dialog') as HTMLDialogElement;
    expect([...dialog.querySelectorAll('button')].every(button => button.disabled)).toBe(true);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(true);
    await page.create();
    expect(api.create).toHaveBeenCalledTimes(1);
    response.next({ data: presentation });
    response.complete();
    await pending;
    expect(dialog.open).toBe(false);
  });

  it('opens a named confirmation and cancels without deleting', async () => {
    const fixture = await createFixture();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.row-actions .danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Maple');
    expect(api.remove).not.toHaveBeenCalled();
    (dialog.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(dialog.open).toBe(false);
    expect(page.pendingDeletion()).toBeNull();
    await page.remove();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation, refreshes the list and exits editing', async () => {
    const fixture = await createFixture();
    page.edit(presentation);
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.row-actions .danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    api.list.mockReturnValue(of({ data: [], meta: { locked: false } }));
    (root.querySelector('dialog .danger') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith('maple');
    expect(root.querySelectorAll('.presentation-row')).toHaveLength(0);
    expect((root.querySelector('dialog') as HTMLDialogElement).open).toBe(false);
    expect(page.editing()).toBeNull();
    expect(root.textContent).toContain('Presentación eliminada del catálogo.');
  });

  it('keeps the confirmation and presentation when the server rejects deletion', async () => {
    const fixture = await createFixture();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.row-actions .danger') as HTMLButtonElement).click();
    api.remove.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Catálogo bloqueado' } })));
    api.list.mockReturnValue(of({ data: [presentation], meta: { locked: true } }));
    await page.remove();
    fixture.detectChanges();
    expect((root.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
    expect(root.querySelector('dialog')?.textContent).toContain('Catálogo bloqueado');
    expect(root.querySelectorAll('.presentation-row')).toHaveLength(1);
    expect(page.message()).toBeNull();
    expect(page.locked()).toBe(true);
  });

  it('disables mutation controls and prevents duplicate deletion while waiting', async () => {
    const fixture = await createFixture();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.row-actions .danger') as HTMLButtonElement).click();
    const response = new Subject<void>();
    api.remove.mockReturnValue(response);
    const pending = page.remove();
    fixture.detectChanges();
    expect([...root.querySelectorAll<HTMLButtonElement>('.heading button, .row-actions button, dialog[open] button')].every(button => button.disabled)).toBe(true);
    await page.remove();
    expect(api.remove).toHaveBeenCalledTimes(1);
    response.next();
    response.complete();
    await pending;
    expect(page.deleting()).toBe(false);
  });

  it('saves only an explicitly selected presentation and never creates through editing', async () => {
    page.form.setValue({ name: 'Cajón', eggs_per_unit: 360, default_unit_price: 101 });
    await page.save();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    page.edit(presentation);
    page.form.controls.default_unit_price.setValue(90);
    await page.save();
    expect(api.update).toHaveBeenCalledWith('maple', { name: 'Maple', eggs_per_unit: 30, default_unit_price: 90 });
  });

  it('disables the whole form and prevents all writes while deliveries are active', async () => {
    api.list.mockReturnValue(of({ data: [presentation], meta: { locked: true } }));
    await page.load();
    expect(page.form.disabled).toBe(true);
    expect(page.creationForm.disabled).toBe(true);
    page.edit(presentation);
    await page.save();
    await page.create();
    expect(page.editing()).toBeNull();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    await page.remove();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('rejects fractional prices and reports a server-side lock without claiming success', async () => {
    const fixture = await createFixture();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.heading .actions button') as HTMLButtonElement).click();
    page.creationForm.setValue({ name: 'Cajón', eggs_per_unit: 360, default_unit_price: 100.01 });
    await page.create();
    expect(api.create).not.toHaveBeenCalled();
    page.creationForm.controls.default_unit_price.setValue(100);
    api.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Catálogo bloqueado' } })));
    await page.create();
    fixture.detectChanges();
    expect(root.querySelector('.creation-dialog')?.textContent).toContain('Catálogo bloqueado');
    expect((root.querySelector('.creation-dialog') as HTMLDialogElement).open).toBe(true);
    expect(page.creationForm.controls.name.value).toBe('Cajón');
    expect(page.message()).toBeNull();
  });
});
