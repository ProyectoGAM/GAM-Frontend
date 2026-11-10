import { Component, forwardRef, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { FeedManufactureFlowComponent } from '../../components/feed-manufacture-flow/feed-manufacture-flow.component';
import { FeedManufacturePage } from './feed-manufacture.page';

@Component({ selector: 'app-feed-manufacture-flow', template: '', providers: [{ provide: FeedManufactureFlowComponent, useExisting: forwardRef(() => FlowStubComponent) }] })
class FlowStubComponent {
  readonly unitId = input.required<number>(); readonly plantId = input.required<number>();
  readonly busy = signal(false);
  canLeave(): boolean { return !this.busy(); }
}

describe('FeedManufacturePage', () => {
  it('passes the route context to the shared flow and prevents leaving while it is busy', () => {
    TestBed.configureTestingModule({ imports: [FeedManufacturePage], providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7', houseId: '22' }) } } },
    ] });
    TestBed.overrideComponent(FeedManufacturePage, { remove: { imports: [FeedManufactureFlowComponent] }, add: { imports: [FlowStubComponent] } });
    const fixture = TestBed.createComponent(FeedManufacturePage); fixture.detectChanges();
    const flow = fixture.debugElement.query(By.directive(FlowStubComponent)).componentInstance as FlowStubComponent;
    expect(flow.unitId()).toBe(7); expect(flow.plantId()).toBe(22);
    expect(fixture.componentInstance.canLeave()).toBe(true);
    flow.busy.set(true); expect(fixture.componentInstance.canLeave()).toBe(false);
  });
});
