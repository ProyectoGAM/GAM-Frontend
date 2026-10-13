import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportHelpComponent } from './report-help.component';

describe('Report contextual help', () => {
  let fixture: ComponentFixture<ReportHelpComponent>;
  let button: HTMLButtonElement;
  let tooltip: HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReportHelpComponent] }).compileComponents();
    fixture = TestBed.createComponent(ReportHelpComponent); fixture.componentRef.setInput('label', 'Modo'); fixture.componentRef.setInput('text', 'Individual: una ave. Grupal: varias aves juntas.');
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
