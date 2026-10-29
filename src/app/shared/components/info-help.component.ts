import { Component, DestroyRef, ElementRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { informationCircleOutline, warningOutline } from 'ionicons/icons';

let nextHelpId = 0;

@Component({
  selector: 'app-info-help',
  imports: [IonIcon],
  host: { '[class.fallback-open]': '!nativePopover && opened()', '[class.warning]': 'tone() === "warning"' },
  template: `
    <button #trigger type="button" [attr.aria-label]="'Información sobre ' + label()" [attr.aria-describedby]="helpId" [attr.aria-controls]="helpId" [attr.aria-expanded]="opened()"
      (pointerenter)="enter()" (pointerleave)="leave()" (focus)="focus()" (blur)="blur()" (click)="togglePinned()">
      <ion-icon [name]="tone() === 'warning' ? 'warning-outline' : 'information-circle-outline'" aria-hidden="true" />
    </button>
    <span #popup class="help-text" [class.inline-help]="!nativePopover" [class.right-help]="placement() === 'right'" [attr.popover]="nativePopover ? 'auto' : null" [hidden]="!opened()" [id]="helpId" role="tooltip"
      (pointerenter)="enter()" (pointerleave)="leave()" (toggle)="popoverChanged()"><strong>{{ label() }}</strong><span>{{ text() }}</span></span>
  `,
  styles: `
    :host { display: inline-block; vertical-align: middle; font-size: 1rem; font-weight: 400; }
    button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; color: var(--gam-color-primary); background: transparent; cursor: pointer; vertical-align: middle; }
    button:hover, button[aria-expanded="true"] { background: var(--gam-color-primary-soft); }
    button:focus-visible { outline: 2px solid var(--gam-color-focus); outline-offset: 2px; } ion-icon { font-size: 1.25rem; }
    :host(.warning) button { position: relative; width: 28px; height: 28px; border-radius: 6px; color: var(--gam-color-warning); background: var(--gam-color-warning-soft); }
    :host(.warning) ion-icon { font-size: 1rem; }
    @media (pointer: coarse) { :host(.warning) button::before { content: ''; position: absolute; inset: -8px; } }
    .help-text { position: fixed; inset: auto; margin: 0; padding: 1rem; box-sizing: border-box; border: 1px solid var(--gam-color-control-border); border-radius: .6rem; background: var(--gam-color-surface); color: var(--gam-color-text); font: inherit; line-height: 1.5; max-height: calc(100dvh - 24px); overflow-y: auto; box-shadow: 0 4px 18px color-mix(in srgb, var(--gam-color-heading) 18%, transparent); }
    .help-text[hidden] { display: none; } .help-text strong, .help-text > span { display: block; } .help-text strong { color: var(--gam-color-heading); margin-bottom: .5rem; } .help-text > span { white-space: pre-line; }
    :host(.fallback-open) { max-width: 100%; } .inline-help { position: static; max-width: 100%; margin-top: .5rem; }
    .right-help { overflow-wrap: anywhere; }
    @media (max-width: 480px) { .right-help { padding: .75rem; } }
  `,
})
export class InfoHelpComponent {
  readonly label = input.required<string>();
  readonly text = input.required<string>();
  readonly placement = input<'bottom' | 'right'>('bottom');
  readonly tone = input<'info' | 'warning'>('info');
  readonly helpId = 'info-help-' + nextHelpId++;
  readonly opened = signal(false);
  readonly nativePopover = typeof HTMLElement.prototype.showPopover === 'function';
  private readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');
  private readonly popup = viewChild<ElementRef<HTMLElement>>('popup');
  private hovered = false;
  private focused = false;
  private pinned = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addIcons({ 'information-circle-outline': informationCircleOutline, 'warning-outline': warningOutline });
    effect(() => { this.text(); this.label(); untracked(() => this.close()); });
    inject(DestroyRef).onDestroy(() => this.close());
  }

  enter(): void { this.hovered = true; this.show(); }
  leave(): void { this.hovered = false; this.scheduleClose(); }
  focus(): void { this.focused = true; this.show(); }
  blur(): void { this.focused = false; this.scheduleClose(); }
  togglePinned(): void { if (this.pinned) this.close(); else { this.pinned = true; this.show(); } }

  popoverChanged(): void {
    if (this.nativePopover && !this.popup()?.nativeElement.matches(':popover-open')) this.close();
  }

  private show(): void {
    this.clearTimer();
    const popup = this.popup()?.nativeElement; const trigger = this.trigger()?.nativeElement;
    if (!popup || !trigger) return;
    popup.hidden = false;
    this.opened.set(true);
    if (this.nativePopover) {
      if (!popup.matches(':popover-open')) popup.showPopover();
      this.position(popup, trigger);
    }
    document.addEventListener('keydown', this.keyDown, true);
    document.addEventListener('pointerdown', this.outsidePointer, true);
    window.addEventListener('resize', this.dismiss);
    document.addEventListener('scroll', this.scroll, true);
  }

  private scheduleClose(): void {
    this.clearTimer();
    this.closeTimer = setTimeout(() => { if (!this.hovered && !this.focused && !this.pinned) this.close(); }, 180);
  }
  private position(popup: HTMLElement, trigger: HTMLElement): void {
    const margin = 12; const gap = 8;
    const onRight = this.placement() === 'right';
    const anchor = onRight ? trigger.querySelector('ion-icon') ?? trigger : trigger;
    const box = anchor.getBoundingClientRect();
    const width = Math.min(380, Math.max(0, onRight ? window.innerWidth - box.right - gap - margin : window.innerWidth - margin * 2));
    popup.style.width = width + 'px';
    const height = popup.getBoundingClientRect().height;
    const left = onRight ? box.right + gap : Math.max(margin, Math.min(box.left, window.innerWidth - width - margin));
    const top = onRight ? Math.max(margin, Math.min(box.bottom + gap, window.innerHeight - height - margin))
      : box.bottom + height + gap <= window.innerHeight - margin ? box.bottom + gap : Math.max(margin, box.top - height - gap);
    popup.style.left = left + 'px'; popup.style.top = top + 'px';
  }
  private clearTimer(): void { if (this.closeTimer !== null) clearTimeout(this.closeTimer); this.closeTimer = null; }
  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.opened()) {
      event.stopImmediatePropagation();
      // Native popovers must consume the browser's close request themselves.
      // Removing one here could pass that same request to the containing modal.
      if (!this.nativePopover) { event.preventDefault(); this.close(); }
    }
  };
  private readonly outsidePointer = (event: PointerEvent): void => {
    if (!(event.target instanceof Node)) return;
    if (!this.trigger()?.nativeElement.contains(event.target) && !this.popup()?.nativeElement.contains(event.target)) this.close();
  };
  private readonly scroll = (event: Event): void => {
    const popup = this.popup()?.nativeElement; const trigger = this.trigger()?.nativeElement;
    if (popup?.contains(event.target as Node)) return;
    if (this.nativePopover && this.focused && this.opened() && popup && trigger) {
      const box = trigger.getBoundingClientRect();
      if (box.bottom > 0 && box.top < window.innerHeight) { this.position(popup, trigger); return; }
    }
    this.close();
  };
  private readonly dismiss = (): void => this.close();

  private close(): void {
    this.clearTimer(); this.pinned = false; this.opened.set(false);
    const popup = this.popup()?.nativeElement;
    if (this.nativePopover && popup?.isConnected && popup.matches(':popover-open')) popup.hidePopover();
    if (popup) popup.hidden = true;
    document.removeEventListener('keydown', this.keyDown, true);
    document.removeEventListener('pointerdown', this.outsidePointer, true);
    window.removeEventListener('resize', this.dismiss);
    document.removeEventListener('scroll', this.scroll, true);
  }
}
