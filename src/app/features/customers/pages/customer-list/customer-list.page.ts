import { Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, searchOutline, optionsOutline, locationOutline, createOutline, chevronForwardOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { isAdminUser } from '../../../../core/auth/access-policy';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { formatUyuMoney } from '../../../../shared/utils/uyu-money';
import { Customer, CustomerListFilters, Pagination } from '../../interfaces/customer';
import { AccountSituation, CustomerStatus } from '../../types/customer.types';
import { CustomersApi } from '../../services/customers.api';
import { customerErrorMessage } from '../../services/customer-errors';

@Component({
  selector: 'app-customer-list',
  templateUrl: './customer-list.page.html',
  styleUrls: ['../../customers.scss', './customer-list.page.scss'],
  imports: [RouterLink, IonIcon, FilterDialogComponent],
})
export class CustomerListPage {
  private readonly api = inject(CustomersApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required(FilterDialogComponent);
  private requestId = 0;

  readonly customers = signal<Customer[]>([]);
  readonly meta = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly search = signal(this.route.snapshot.queryParamMap.get('search') ?? '');
  readonly status = signal<CustomerStatus | ''>('active');
  readonly situation = signal<AccountSituation | ''>('');
  readonly filters = signal<CustomerListFilters>({ status: 'active', per_page: 25 });
  readonly canManage = computed(() => isAdminUser(this.auth.user()) || this.auth.user()?.permissions?.includes('customers.manage'));
  readonly canViewAccounts = computed(() => isAdminUser(this.auth.user()) || this.auth.user()?.permissions?.includes('customer-accounts.view'));
  readonly filterCount = computed(() => Number(Boolean(this.filters().status)) + Number(Boolean(this.filters().account_status)));
  readonly money = formatUyuMoney;

  constructor() {
    addIcons({ addOutline, searchOutline, optionsOutline, locationOutline, createOutline, chevronForwardOutline });
    this.setStatus(this.route.snapshot.queryParamMap.get('status') ?? 'active');
    this.setSituation(this.route.snapshot.queryParamMap.get('account_status') ?? '');
    this.filters.set(this.currentFilters());
    const page = Number(this.route.snapshot.queryParamMap.get('page') ?? 1);
    this.destroyRef.onDestroy(() => { this.requestId++; });
    void this.load(Number.isInteger(page) && page > 0 ? page : 1);
  }

  async load(page = 1): Promise<void> {
    const request = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.list(this.filters(), page));
      if (request !== this.requestId) return;
      this.customers.set(response.data);
      this.meta.set(response.meta);
      await this.router.navigate([], { relativeTo: this.route, queryParams: { ...this.filters(), page }, replaceUrl: true });
    } catch (error) {
      if (request === this.requestId) this.error.set(customerErrorMessage(error, 'No se pudieron cargar los clientes.'));
    } finally {
      if (request === this.requestId) this.loading.set(false);
    }
  }

  openFilters(trigger: HTMLElement): void {
    this.status.set(this.filters().status ?? '');
    this.situation.set(this.filters().account_status ?? '');
    this.dialog().open(trigger);
  }

  applyFilters(): void {
    this.filters.set(this.currentFilters());
    this.dialog().close();
    void this.load();
  }

  clearFilters(): void { this.status.set(''); this.situation.set(''); }
  searchCustomers(): void { this.filters.set({ ...this.filters(), search: this.search().trim() || undefined }); void this.load(); }
  setStatus(value: string): void { this.status.set(value === 'active' || value === 'inactive' ? value : ''); }
  setSituation(value: string): void { this.situation.set(value === 'debt' || value === 'settled' || value === 'credit' ? value : ''); }

  private currentFilters(): CustomerListFilters {
    return { search: this.search().trim() || undefined, status: this.status() || undefined,
      account_status: this.canViewAccounts() ? this.situation() || undefined : undefined, per_page: 25 };
  }
}
