import { Component, computed, input } from '@angular/core';
import { CollectionSummary } from '../../interfaces/flock-collection.interface';
import { DetailMetric } from '../../interfaces/flock-detail.interface';
import { collectionDate, collectionNumber, collectionTrendText } from '../../services/collection-summary';

@Component({
  selector: 'app-collection-summary',
  templateUrl: './collection-summary.component.html',
  styleUrl: './collection-summary.component.scss',
})
export class CollectionSummaryComponent {
  readonly metric = input.required<DetailMetric<CollectionSummary>>();
  readonly view = computed(() => {
    const summary = this.metric().value;
    return summary ? { ...summary, totalText: collectionNumber(summary.total),
      latestText: summary.latestDay ? collectionNumber(summary.latestDay.quantity) : null,
      latestDate: summary.latestDay ? collectionDate(summary.latestDay.date) : null,
      averageText: summary.average === null ? null : collectionNumber(summary.average),
      trendText: collectionTrendText(summary) } : null;
  });
}
