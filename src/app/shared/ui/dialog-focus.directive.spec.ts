import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogFocusDirective } from './dialog-focus.directive';

@Component({ imports: [DialogFocusDirective], template: `<button id="trigger">Abrir</button>@if (open()) { <section appDialogFocus tabindex="-1"><button id="first">Primero</button><input disabled><button id="last">Último</button></section> }` })
class HostComponent { readonly open = signal(false); }

describe('DialogFocusDirective', () => {
  it('keeps Tab in the dialog, skips disabled fields and restores focus after closing', async () => {
    const fixture = TestBed.createComponent(HostComponent); fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement; trigger.focus();
    fixture.componentInstance.open.set(true); fixture.detectChanges(); await fixture.whenStable();
    const first = fixture.nativeElement.querySelector('#first') as HTMLButtonElement;
    const last = fixture.nativeElement.querySelector('#last') as HTMLButtonElement;
    first.focus(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); expect(document.activeElement).toBe(first);
    fixture.componentInstance.open.set(false); fixture.detectChanges(); expect(document.activeElement).toBe(trigger);
  });
});
