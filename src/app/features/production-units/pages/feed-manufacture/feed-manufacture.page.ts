import { Component, inject, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FeedManufactureFlowComponent } from '../../components/feed-manufacture-flow/feed-manufacture-flow.component';

@Component({
  selector: 'app-feed-manufacture-page',
  imports: [FeedManufactureFlowComponent],
  template: '<app-feed-manufacture-flow [unitId]="unitId" [plantId]="plantId" />',
})
export class FeedManufacturePage {
  private readonly route = inject(ActivatedRoute);
  private readonly flow = viewChild(FeedManufactureFlowComponent);
  readonly unitId = Number(this.route.snapshot.paramMap.get('id'));
  readonly plantId = Number(this.route.snapshot.paramMap.get('houseId'));

  canLeave(): boolean { return this.flow()?.canLeave() ?? true; }
}
