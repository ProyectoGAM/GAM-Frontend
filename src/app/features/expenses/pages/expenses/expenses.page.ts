import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { hasAnyPermission } from '../../../../core/auth/permission-keys';
import { AuthStore } from '../../../../core/auth/auth.store';
import { formatUyuMoney, parseUyuAmount, uyuDecimal } from '../../../../shared/utils/uyu-money';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { Expense } from '../../interfaces/expense';
import { ExpensesService } from '../../services/expenses.service';

type ExpenseScope = 'all' | 'global' | number;
type ExpenseState = { status: 'ready'; expenses: Expense[] }
  | { status: 'loading' | 'error' | 'unit-error' | 'forbidden' };

const PAGE_SIZE = 20;

@Component({
  selector: 'app-expenses-page',
  imports: [RouterLink],
  templateUrl: './expenses.page.html',
  styleUrl: './expenses.page.scss',
})
export class ExpensesPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(ExpensesService);
  private readonly unitContext = inject(AdminUnitContextService);
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly selection = linkedSignal<ExpenseScope>(() => {
    const unitId = Number(this.queryParams()?.get('up_id'));
    return Number.isSafeInteger(unitId) && unitId > 0 ? unitId : 'all';
  });
  private readonly refreshVersion = signal(0);
  private readonly userUnitId = computed(() => this.auth.session()?.up_id ?? this.auth.user()?.up_id ?? null);
  private readonly sharedSession = computed(() => this.auth.session()?.kind === 'shared_user');
  private readonly canViewInstallations = computed(() => (!this.sharedSession() || this.userUnitId() !== null) && (this.auth.isAdmin() || (
    hasAnyPermission(this.auth.user()?.permissions, 'can_view_production_units')
    && hasAnyPermission(this.auth.user()?.permissions, 'can_view_poultry_houses')
  )));
  private readonly vehicleAccess = computed(() => {
    const personal = this.auth.user() !== null && this.userUnitId() === null && !this.sharedSession();
    const permissions = this.auth.user()?.permissions;
    return {
      fuel: personal && (this.auth.isAdmin() || hasAnyPermission(permissions, 'can_view_vehicle_fuel', 'can_manage_vehicle_fuel')),
      maintenance: personal && (this.auth.isAdmin() || hasAnyPermission(permissions, 'can_view_vehicle_maintenance', 'can_manage_vehicle_maintenance')),
    };
  });
  readonly canViewGlobal = computed(() => this.vehicleAccess().fuel || this.vehicleAccess().maintenance);
  readonly units = computed(() => this.canViewInstallations() ? this.unitContext.units() : []);
  readonly scope = computed(() => {
    const unitId = this.userUnitId();
    const selection = this.selection();
    if (unitId !== null) return unitId;
    if (!this.canViewInstallations()) return 'global';
    return typeof selection === 'number' && !this.units().some((unit) => unit.id === selection) ? 'all' : selection;
  });
  readonly canFilter = computed(() => this.userUnitId() === null && this.canViewInstallations());
  readonly page = signal(1);

  private readonly request = computed(() => {
    const unitId = this.userUnitId();
    const useUnits = this.canViewInstallations();
    const unitState = useUnits ? this.unitContext.state() : 'ready';
    const units = this.units().filter((unit) => unitId === null || unit.id === unitId);
    const access = this.vehicleAccess();
    return { unitState, units, access, authorized: useUnits || access.fuel || access.maintenance, version: this.refreshVersion() };
  });
  readonly result = toSignal(toObservable(this.request).pipe(
    switchMap(({ unitState, units, access, authorized }): Observable<ExpenseState> => {
      if (!authorized) return of({ status: 'forbidden' });
      if (unitState === 'loading') return of({ status: 'loading' });
      if (unitState === 'error') return of({ status: 'unit-error' });
      return this.api.list(units, access).pipe(
        map((expenses): ExpenseState => ({ status: 'ready', expenses })),
        startWith<ExpenseState>({ status: 'loading' }),
        catchError(() => of<ExpenseState>({ status: 'error' })),
      );
    }),
  ), { initialValue: { status: 'loading' } as ExpenseState });
  private readonly expenses = computed(() => {
    const result = this.result();
    if (result.status !== 'ready') return [];
    const scope = this.scope();
    if (scope === 'all') return result.expenses;
    return result.expenses.filter(({ unit }) => scope === 'global' ? unit === null : unit?.id === scope);
  });
  readonly count = computed(() => this.expenses().length);
  readonly lastPage = computed(() => Math.max(1, Math.ceil(this.count() / PAGE_SIZE)));
  readonly currentPage = computed(() => Math.min(this.page(), this.lastPage()));
  readonly rows = computed(() => {
    const offset = (this.currentPage() - 1) * PAGE_SIZE;
    return this.expenses().slice(offset, offset + PAGE_SIZE).map((expense) => ({
      ...expense,
      dateLabel: expense.date.split('-').reverse().join('/'),
      costLabel: `${formatUyuMoney(expense.amount)} ${expense.currency}`,
    }));
  });
  readonly totalLabels = computed(() => {
    const totals = new Map<string, bigint>();
    for (const { amount, currency } of this.expenses()) {
      const value = parseUyuAmount(amount);
      if (value !== null) totals.set(currency, (totals.get(currency) ?? 0n) + value);
    }
    return [...totals].map(([currency, total]) => ({
      currency,
      label: `${formatUyuMoney(uyuDecimal(total))} ${currency}`,
    }));
  });

  changeScope(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement) || !this.canFilter()) return;
    const value = event.target.value;
    if (value === 'all' || (value === 'global' && this.canViewGlobal())) this.selection.set(value);
    else if (this.units().some((unit) => String(unit.id) === value)) this.selection.set(Number(value));
    this.page.set(1);
  }

  retry(): void {
    if (this.result().status === 'unit-error') void this.unitContext.load();
    else this.refreshVersion.update((version) => version + 1);
  }

  goTo(delta: number): void {
    this.page.set(Math.max(1, Math.min(this.lastPage(), this.currentPage() + delta)));
  }
}
