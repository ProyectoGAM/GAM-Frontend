import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** Mantiene el teclado dentro de los diálogos existentes y devuelve el foco al disparador. */
@Directive({ selector: '[appDialogFocus]', host: { '(keydown)': 'onKeydown($event)' } })
export class DialogFocusDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  constructor() {
    afterNextRender(() => { if (this.host.isConnected) this.host.focus(); });
    inject(DestroyRef).onDestroy(() => { if (this.previous?.isConnected) this.previous.focus(); });
  }
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const controls = [...this.host.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')]
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[hidden],[inert]'));
    const first = controls[0]; const last = controls.at(-1);
    const active = document.activeElement;
    if (!first || event.shiftKey && (active === first || active === this.host) || !event.shiftKey && (active === last || active === this.host)) {
      event.preventDefault(); (event.shiftKey ? last : first)?.focus();
    }
  }
}
