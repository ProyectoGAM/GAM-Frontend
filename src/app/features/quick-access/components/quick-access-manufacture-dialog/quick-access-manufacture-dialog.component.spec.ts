import { Component, forwardRef, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FeedManufactureFlowComponent } from '../../../production-units/components/feed-manufacture-flow/feed-manufacture-flow.component';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { QuickAccessManufactureDialogComponent } from './quick-access-manufacture-dialog.component';

@Component({ selector: 'app-feed-manufacture-flow', template: '<h1 id="page-title" tabindex="-1">Elaborar ración</h1>', providers: [{ provide: FeedManufactureFlowComponent, useExisting: forwardRef(() => FlowStubComponent) }] })
class FlowStubComponent {
  readonly unitId = input.required<number>(); readonly plantId = input.required<number>(); readonly embedded = input(false);
  readonly closed = output<string | null>(); readonly busy = signal(false);
  canLeave(): boolean { return !this.busy(); }
  close(): void { if (this.canLeave()) this.closed.emit(null); }
}

describe('QuickAccessManufactureDialogComponent', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = stubNativeDialog();
    TestBed.configureTestingModule({ imports: [QuickAccessManufactureDialogComponent] });
    TestBed.overrideComponent(QuickAccessManufactureDialogComponent, { remove: { imports: [FeedManufactureFlowComponent] }, add: { imports: [FlowStubComponent] } });
  });
  afterEach(() => restore());

  async function render() {
    const fixture = TestBed.createComponent(QuickAccessManufactureDialogComponent);
    fixture.componentRef.setInput('request', { unitId: 7, plantId: 22, plantName: 'Planta Norte', unitName: 'San José', trigger: null });
    const closed = vi.fn(); fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const flow = fixture.debugElement.query(By.directive(FlowStubComponent)).componentInstance as FlowStubComponent;
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    return { fixture, flow, dialog, closed };
  }

  it('opens a native modal with the selected context and closes only once', async () => {
    const { fixture, flow, dialog, closed } = await render();
    expect(dialog.open).toBe(true); expect(flow.unitId()).toBe(7); expect(flow.plantId()).toBe(22); expect(flow.embedded()).toBe(true);
    flow.closed.emit('Elaboración registrada.'); fixture.componentInstance.finish('Duplicado');
    expect(dialog.open).toBe(false); expect(closed).toHaveBeenCalledExactlyOnceWith('Elaboración registrada.');
    fixture.destroy();
  });

  it('prevents Escape or backdrop closure while busy and permits cancellation afterwards', async () => {
    const { fixture, flow, dialog, closed } = await render();
    flow.busy.set(true);
    const cancel = new Event('cancel', { cancelable: true }); dialog.dispatchEvent(cancel);
    dialog.dispatchEvent(new MouseEvent('click', { clientX: -1, clientY: -1 }));
    expect(cancel.defaultPrevented).toBe(true); expect(dialog.open).toBe(true); expect(closed).not.toHaveBeenCalled();
    expect(fixture.componentInstance.canLeave()).toBe(false);
    flow.busy.set(false); dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(false); expect(closed).toHaveBeenCalledExactlyOnceWith(null); fixture.destroy();
  });
});
