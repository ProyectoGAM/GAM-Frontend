import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { swapHorizontalOutline } from 'ionicons/icons';
import { AuthStore } from '../../../core/auth/auth.store';
import { formatUyuMoney } from '../../../shared/utils/uyu-money';
import { hasAnyPermission } from '../../../core/auth/permission-keys';
import { SummaryPeriod } from '../interfaces/operational-summary';
import { OperationalSummaryService } from '../services/operational-summary.service';
import { eggChange, summaryInstant, summaryMoney, summaryNumber, urgencyLevels } from '../services/summary-presentation';
import { summaryResource } from '../services/summary-resource';
import { SummaryCardComponent } from './summary-card.component';
import { SummaryProductionChartComponent } from './summary-production-chart.component';

@Component({
  selector: 'app-summary-scope',
  imports: [IonIcon, SummaryCardComponent, SummaryProductionChartComponent],
  templateUrl: './summary-scope.component.html',
  styleUrl: './summary-scope.component.scss',
})
export class SummaryScopeComponent {
  readonly period = input.required<SummaryPeriod>();
  readonly unit = input<number | null>(null);
  readonly company = input(false);

  private readonly api = inject(OperationalSummaryService);
  private readonly auth = inject(AuthStore);
  private readonly rangeAndUnit = computed(() => ({ period: this.period(), unit: this.unit() }));
  private readonly scope = computed(() => ({ unit: this.unit() }));

  protected readonly eggs = summaryResource(() => this.allowed('can_view_egg_collections') ? this.rangeAndUnit() : null,
    ({ period, unit }) => this.api.eggs(period, unit));
  protected readonly eggCatalog = summaryResource(() => this.auth.isAdmin() ? true : null,
    () => this.api.eggPresentations());
  protected readonly presentations = computed(() => this.eggCatalog.state().data ?? []);
  private readonly presentationIndex = linkedSignal(() =>
    Math.max(0, this.presentations().findIndex(({ eggs_per_unit }) => eggs_per_unit > 1)));
  protected readonly eggEquivalence = computed(() => {
    const total = this.eggs.state().data?.total_eggs;
    const presentation = this.presentations()[this.presentationIndex()];
    if (total === undefined || !presentation) return null;

    const whole = Math.floor(total / presentation.eggs_per_unit);
    const rest = total % presentation.eggs_per_unit;
    const extraEggs = rest === 1 ? 'huevo suelto' : 'huevos sueltos';
    const equivalent = summaryNumber(whole) + ' × ' + presentation.label;
    return rest ? equivalent + ' + ' + summaryNumber(rest) + ' ' + extraEggs : equivalent;
  });
  protected readonly cycleIcon = swapHorizontalOutline;
  protected readonly birds = summaryResource(() => this.allowed('can_view_flocks') ? this.scope() : null,
    ({ unit }) => this.api.liveBirds(unit));
  protected readonly mortality = summaryResource(() => this.allowed('can_view_mortality') ? this.rangeAndUnit() : null,
    ({ period, unit }) => this.api.mortality(period, unit));
  protected readonly alerts = summaryResource(() => this.allowed('can_view_notifications') ? this.scope() : null,
    ({ unit }) => this.api.alerts(unit));
  protected readonly expenses = summaryResource(() => this.allowed('can_view_poultry_houses', 'can_view_vehicle_fuel',
    'can_view_vehicle_maintenance') ? this.rangeAndUnit() : null, ({ period, unit }) => this.api.expenses(period, unit));
  protected readonly delivered = summaryResource(() => this.company() && this.allowed('can_view_reports')
    && this.allowed('can_view_delivery_history') ? this.period() : null, (period) => this.api.deliveredValue(period));
  protected readonly showNetResult = computed(() => this.delivered.state().status !== 'hidden'
    || this.expenses.state().status !== 'hidden');

  protected readonly hasIndicators = computed(() => [this.eggs, this.mortality, this.birds, this.delivered, this.expenses, this.alerts]
    .some((card) => card.state().status !== 'hidden'));

  protected readonly number = summaryNumber;
  protected readonly money = summaryMoney;
  protected readonly deliveredMoney = formatUyuMoney;
  protected readonly instant = summaryInstant;
  protected readonly change = eggChange;
  protected readonly urgencies = urgencyLevels;

  protected nextEggPresentation(): void {
    const count = this.presentations().length;
    if (count > 1) this.presentationIndex.update((index) => (index + 1) % count);
  }

  private allowed(...keys: string[]): boolean {
    return this.auth.isAdmin() || hasAnyPermission(this.auth.user()?.permissions, ...keys);
  }
}
