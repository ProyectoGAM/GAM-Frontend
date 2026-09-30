import { TestBed } from '@angular/core/testing';

import { InventoryConfirmationDialogComponent } from './confirmation-dialog.component';
import { stubNativeDialog } from '../../testing/native-dialog-test';

describe('Inventory confirmation dialog', () => {
  let restoreDialog: () => void;

  beforeEach(() => { restoreDialog = stubNativeDialog(); });
  afterEach(() => { restoreDialog(); document.body.innerHTML = ''; });

  it('opens modally, cancels on Escape, and returns focus to the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const fixture = TestBed.configureTestingModule({ imports: [InventoryConfirmationDialogComponent] })
      .createComponent(InventoryConfirmationDialogComponent);
    fixture.componentInstance.title = 'Confirmar cambio';
    fixture.detectChanges();
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);

    fixture.componentInstance.open(opener);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('button'));

    const escape = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(escape);
    fixture.detectChanges();

    expect(escape.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    fixture.destroy();
  });

  it('does not close while busy and disables both actions', () => {
    const fixture = TestBed.configureTestingModule({ imports: [InventoryConfirmationDialogComponent] })
      .createComponent(InventoryConfirmationDialogComponent);
    fixture.componentInstance.title = 'Confirmar cambio';
    fixture.componentInstance.busy = true;
    fixture.detectChanges();
    fixture.componentInstance.open();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const buttons = [...dialog.querySelectorAll('button')];
    buttons[0].click();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(dialog.open).toBe(true);
    expect(buttons.every(button => button.disabled)).toBe(true);
    fixture.destroy();
  });
});
