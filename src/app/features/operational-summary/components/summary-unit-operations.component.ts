import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { bagHandleOutline, layersOutline } from 'ionicons/icons';
import { AuthStore } from '../../../core/auth/auth.store';
import { hasAnyPermission } from '../../../core/auth/permission-keys';
import { formatFeedKg } from '../../flocks/services/feeding-summary';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { OperationalSummaryService } from '../services/operational-summary.service';
import { summaryNumber } from '../services/summary-presentation';
import { summaryResource } from '../services/summary-resource';

@Component({
  selector: 'app-summary-unit-operations',
  imports: [IonIcon, RouterLink],
  templateUrl: './summary-unit-operations.component.html',
  styleUrl: './summary-unit-operations.component.scss',
})
export class SummaryUnitOperationsComponent {
  readonly unit = input.required<number>();

  private readonly api = inject(OperationalSummaryService);
  private readonly locations = inject(ProductionUnitsService);
  private readonly auth = inject(AuthStore);

  protected readonly flocks = summaryResource(() => this.allowed('can_view_flocks') ? this.unit() : null,
    (unit) => this.api.flocks(unit, 1));
  protected readonly houses = summaryResource(() => this.allowed('can_view_poultry_houses') ? this.unit() : null,
    (unit) => this.locations.poultryHouses(unit, 'poultry'));
  protected readonly stock = summaryResource(this.unit, (unit) => this.api.feedBalances(unit, 1));
  protected readonly names = computed(() => new Map(this.houses.state().data?.map((house) => [house.id, house.name])));
  protected readonly flockQuery = computed(() => ({ up_id: this.unit() }));
  protected readonly flocksIcon = layersOutline;
  protected readonly stockIcon = bagHandleOutline;
  protected readonly number = summaryNumber;
  protected readonly kg = formatFeedKg;

  private allowed(key: string): boolean {
    return this.auth.isAdmin() || hasAnyPermission(this.auth.user()?.permissions, key);
  }
}
