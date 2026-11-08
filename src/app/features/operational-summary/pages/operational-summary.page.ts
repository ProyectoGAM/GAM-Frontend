import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { calendarOutline, chevronDownOutline } from 'ionicons/icons';
import { AuthStore } from '../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../admin/services/admin-unit-context.service';
import { SummaryScopeComponent } from '../components/summary-scope.component';
import { SummaryUnitOperationsComponent } from '../components/summary-unit-operations.component';
import { summaryPeriod } from '../services/summary-presentation';

@Component({
  selector: 'app-operational-summary',
  imports: [IonIcon, SummaryScopeComponent, SummaryUnitOperationsComponent],
  templateUrl: './operational-summary.page.html',
  styleUrl: './operational-summary.page.scss',
})
export class OperationalSummaryPage {
  private readonly auth = inject(AuthStore);
  protected readonly context = inject(AdminUnitContextService);
  protected readonly durations = [7, 14, 30, 90];
  protected readonly days = signal(7);
  protected readonly period = computed(() => summaryPeriod(this.days()));
  protected readonly pin = computed(() => this.auth.status() === 'shared_authenticated');
  protected readonly calendarIcon = calendarOutline;
  protected readonly chevronIcon = chevronDownOutline;
  protected readonly selectedUnit = linkedSignal({
    source: this.context.units,
    computation: (units, previous): number | null => units.find((unit) => unit.id === previous?.value)?.id ?? null,
  });
  protected readonly effectiveUnit = computed(() => this.pin() ? this.auth.user()?.up_id ?? null : this.selectedUnit());
  protected readonly global = computed(() => !this.pin() && this.effectiveUnit() === null);
  protected readonly title = computed(() => {
    if (this.pin()) return 'Tu unidad productiva';
    if (this.global()) return 'Resumen global';
    return this.context.units().find((unit) => unit.id === this.effectiveUnit())?.name ?? 'Unidad productiva';
  });

  protected updateDays(value: string): void {
    const days = Number(value);
    if (this.durations.includes(days)) this.days.set(days);
  }

  protected updateUnit(value: string): void {
    this.selectedUnit.set(this.context.units().find((unit) => unit.id === Number(value))?.id ?? null);
  }
}
