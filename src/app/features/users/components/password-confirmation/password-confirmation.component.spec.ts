import { TestBed } from '@angular/core/testing';

import { PasswordConfirmationComponent } from './password-confirmation.component';
import { stubNativeDialog } from '../../../inventory/testing/native-dialog-test';

describe('User password confirmation', () => {
  let restore: () => void;
  beforeEach(() => { restore = stubNativeDialog(); });
  afterEach(() => restore());

  it('focuses the password, emits once, clears it and supports cancellation', () => {
    const fixture = TestBed.createComponent(PasswordConfirmationComponent);
    fixture.componentRef.setInput('operator', 'Admin');
    fixture.componentRef.setInput('action', { title: 'Cerrar sesiones', target: 'Ana', description: 'Se cerrarán sus sesiones.', button: 'Confirmar' });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
    const confirm = vi.fn(); const cancel = vi.fn(); component.confirm.subscribe(confirm); component.cancelled.subscribe(cancel);
    component.submit(); expect(confirm).not.toHaveBeenCalled();
    component.password.setValue('example-only');
    const submit = new Event('submit', { cancelable: true }); dialog.querySelector('form')?.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true); expect(confirm).toHaveBeenCalledWith('example-only'); expect(component.password.value).toBe('');
    fixture.componentRef.setInput('busy', true); fixture.detectChanges(); component.password.setValue('example-only');
    component.submit(); component.cancel(); expect(confirm).toHaveBeenCalledTimes(1); expect(cancel).not.toHaveBeenCalled();
    fixture.componentRef.setInput('busy', false); fixture.detectChanges(); dialog.dispatchEvent(new Event('cancel', { cancelable: true })); expect(cancel).toHaveBeenCalledTimes(1); expect(component.password.value).toBe('');
    fixture.destroy();
  });
});
