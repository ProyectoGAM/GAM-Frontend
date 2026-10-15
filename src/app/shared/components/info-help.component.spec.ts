import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InfoHelpComponent } from './info-help.component';

describe('Contextual help', () => {
  let fixture: ComponentFixture<InfoHelpComponent>;
  let button: HTMLButtonElement;
  let tooltip: HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [InfoHelpComponent] }).compileComponents();
    fixture = TestBed.createComponent(InfoHelpComponent); fixture.componentRef.setInput('label', 'Modo'); fixture.componentRef.setInput('text', 'Individual: una ave. Grupal: varias aves juntas.');
    fixture.detectChanges(); await fixture.whenStable();
    button = (fixture.nativeElement as HTMLElement).querySelector('button')!; tooltip = (fixture.nativeElement as HTMLElement).querySelector('[role="tooltip"]')!;
  });
  afterEach(() => { fixture.destroy(); vi.useRealTimers(); });

  it('connects the explanation to the info button and opens on hover without submitting', () => {
    expect(button.type).toBe('button'); expect(button.getAttribute('aria-label')).toBe('Información sobre Modo');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id); expect(tooltip.hidden).toBe(true);
    button.dispatchEvent(new Event('pointerenter')); fixture.detectChanges();
    expect(tooltip.hidden).toBe(false); expect(tooltip.textContent).toContain('varias aves');
  });
  it('keeps help readable when moving from the icon onto the tooltip and dismisses on Escape', () => {
    vi.useFakeTimers(); button.dispatchEvent(new Event('pointerenter')); button.dispatchEvent(new Event('pointerleave'));
    tooltip.dispatchEvent(new Event('pointerenter')); vi.advanceTimersByTime(200); fixture.detectChanges();
    expect(tooltip.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(tooltip.hidden).toBe(true);
  });
  it('supports focus and pinned tap help with outside dismissal', () => {
    vi.useFakeTimers(); button.dispatchEvent(new FocusEvent('focus')); button.click(); button.dispatchEvent(new FocusEvent('blur'));
    button.dispatchEvent(new Event('pointerleave')); vi.advanceTimersByTime(200); fixture.detectChanges();
    expect(tooltip.hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); fixture.detectChanges();
    expect(tooltip.hidden).toBe(true);
  });
  it('closes when its explanation changes and removes listeners on destruction', () => {
    button.click(); fixture.detectChanges(); fixture.componentRef.setInput('text', 'Nueva explicación'); fixture.detectChanges();
    expect(tooltip.hidden).toBe(true);
    fixture.destroy(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.opened()).toBe(false);
  });
});

describe('InfoHelpComponent', () => {
  it('lets a native popover consume Escape without exposing the containing modal to that close request', () => {
    const fixture = TestBed.createComponent(InfoHelpComponent);
    fixture.componentRef.setInput('label', 'Ración'); fixture.componentRef.setInput('text', 'Recetas disponibles.');
    fixture.detectChanges();
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    const popup: HTMLElement = fixture.nativeElement.querySelector('[role="tooltip"]');
    let nativeOpen = false;
    Object.defineProperty(fixture.componentInstance, 'nativePopover', { value: true });
    popup.showPopover = vi.fn(() => { nativeOpen = true; });
    popup.hidePopover = vi.fn(() => { nativeOpen = false; });
    vi.spyOn(popup, 'matches').mockImplementation(() => nativeOpen);
    const parentEscape = vi.fn(); document.addEventListener('keydown', parentEscape);
    try {
      trigger.dispatchEvent(new FocusEvent('focus')); fixture.detectChanges();
      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      trigger.dispatchEvent(escape);
      expect(parentEscape).not.toHaveBeenCalled(); expect(escape.defaultPrevented).toBe(false);
      expect(popup.hidePopover).not.toHaveBeenCalled();
      // The browser closes its native layer before notifying the component.
      nativeOpen = false; popup.dispatchEvent(new Event('toggle')); fixture.detectChanges();
      expect(trigger.getAttribute('aria-expanded')).toBe('false'); expect(popup.hidden).toBe(true);
    } finally { document.removeEventListener('keydown', parentEscape); }
  });

  it('opens help by keyboard and consumes Escape before the containing modal receives it', () => {
    const fixture = TestBed.createComponent(InfoHelpComponent);
    fixture.componentRef.setInput('label', 'Ración');
    fixture.componentRef.setInput('text', 'Solo recetas activas con stock positivo.');
    fixture.detectChanges();
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    const parentEscape = vi.fn();
    // Ionic has already registered its document listener when help is opened.
    document.addEventListener('keydown', parentEscape);
    try {
      trigger.dispatchEvent(new FocusEvent('focus')); fixture.detectChanges();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(fixture.nativeElement.querySelector('[role="tooltip"]').hidden).toBe(false);
      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      trigger.dispatchEvent(escape); fixture.detectChanges();
      expect(escape.defaultPrevented).toBe(true); expect(parentEscape).not.toHaveBeenCalled();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(fixture.nativeElement.querySelector('[role="tooltip"]').hidden).toBe(true);
    } finally { document.removeEventListener('keydown', parentEscape); }
  });
});
