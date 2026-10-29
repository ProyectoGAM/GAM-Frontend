import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon, IonModal } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, createOutline, addOutline, walletOutline, powerOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { isAdminUser } from '../../../../core/auth/access-policy';
import { formatUyuMoney } from '../../../../shared/utils/uyu-money';
import { DeliveryStop } from '../../../deliveries/delivery.models';
import { CustomerAccountOperationComponent } from '../../components/customer-account-operation/customer-account-operation.component';
import { Customer, CustomerAccountSnapshot, CustomerMovement, CustomerStatement, MovementFilters, Pagination } from '../../interfaces/customer';
import { CustomerMovementType, CustomerStatus, PaymentMethod } from '../../types/customer.types';
import { PendingCustomerCommand } from '../../types/customer-command.type';
import { CustomerPendingCommands } from '../../services/customer-pending-commands';
import { CustomersApi } from '../../services/customers.api';
import { customerErrorMessage, hasUncertainCustomerResult } from '../../services/customer-errors';

type OperationSelection = { mode: 'payment' | 'adjustment' | 'reversal'; movement: CustomerMovement | null };

@Component({
  selector: 'app-customer-detail',
  templateUrl: './customer-detail.page.html',
  styleUrls: ['../../customers.scss', './customer-detail.page.scss'],
  imports: [RouterLink, DatePipe, IonIcon, IonModal, CustomerAccountOperationComponent],
})
export class CustomerDetailPage {
  private readonly api = inject(CustomersApi);
  private readonly auth = inject(AuthStore);
  private readonly commands = inject(CustomerPendingCommands);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;
  private movementRequest = 0;
  private deliveryRequest = 0;
  private statusTrigger: HTMLElement | null = null;
  private readonly statusDialog = viewChild.required<ElementRef<HTMLDialogElement>>('statusDialog');
  private readonly statusTitle = viewChild.required<ElementRef<HTMLElement>>('statusTitle');
  readonly operationForm = viewChild(CustomerAccountOperationComponent);
  readonly customer = signal<Customer | null>(null);
  readonly account = signal<CustomerAccountSnapshot | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly tab = signal<'account' | 'deliveries' | 'data'>('account');
  readonly movements = signal<CustomerMovement[]>([]);
  readonly statement = signal<CustomerStatement | null>(null);
  readonly movementMeta = signal<Pagination | null>(null);
  readonly movementLoading = signal(false);
  readonly movementError = signal<string | null>(null);
  readonly movementFilters = signal<MovementFilters>({ per_page: 25 });
  readonly deliveries = signal<DeliveryStop[]>([]);
  readonly deliveryMeta = signal<Pagination | null>(null);
  readonly deliveryLoading = signal(false);
  readonly deliveryError = signal<string | null>(null);
  readonly accountLoading = signal(false);
  readonly accountError = signal<string | null>(null);
  readonly operation = signal<OperationSelection | null>(null);
  readonly operationBusy = signal(false);
  readonly operationClosing = signal(false);
  readonly statusBusy = signal(false);
  readonly statusError = signal<string | null>(null);
  readonly statusPending = signal<PendingCustomerCommand | null>(null);
  readonly nextStatus = signal<CustomerStatus>('inactive');
  readonly canManage = computed(() => this.allowed('customers.manage'));
  readonly canViewAccount = computed(() => this.allowed('customer-accounts.view'));
  readonly canPay = computed(() => this.allowed('customer-payments.record'));
  readonly canAdjust = computed(() => isAdminUser(this.auth.user()));
  readonly canReverse = computed(() => isAdminUser(this.auth.user()));
  readonly money = formatUyuMoney;
  readonly returnUrl: string;
  readonly movementLabels: Record<CustomerMovementType, string> = { sale_charge: 'Venta en reparto', payment: 'Pago', adjustment_increase: 'Aumento de deuda', adjustment_decrease: 'Disminución de deuda', reversal: 'Reversión' };
  readonly paymentLabels: Record<PaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia', other: 'Otro' };

  constructor() {
    addIcons({ arrowBackOutline, createOutline, addOutline, walletOutline, powerOutline });
    const returnUrl: unknown = this.router.getCurrentNavigation()?.extras.state?.['customersReturnUrl'];
    this.returnUrl = typeof returnUrl === 'string' && returnUrl.startsWith('/administracion/clientes/clientes') ? returnUrl : '/administracion/clientes/clientes';
    this.destroyRef.onDestroy(() => { this.requestId++; this.movementRequest++; this.deliveryRequest++; });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id'); if (!id) return;
    const request = ++this.requestId;
    this.loading.set(true); this.error.set(null); this.customer.set(null); this.account.set(null);
    this.movements.set([]); this.deliveries.set([]); this.movementMeta.set(null); this.deliveryMeta.set(null);
    this.movementRequest++; this.deliveryRequest++;
    try {
      const response = await firstValueFrom(this.api.detail(id));
      if (request !== this.requestId) return;
      this.customer.set(response.data); this.account.set(response.data.account ?? null);
      if (this.canViewAccount()) { this.tab.set('account'); void this.loadMovements(); }
      else this.tab.set('data');
    } catch (error) { if (request === this.requestId) this.error.set(customerErrorMessage(error, 'No se pudo cargar la ficha del cliente.')); }
    finally { if (request === this.requestId) this.loading.set(false); }
  }

  selectTab(tab: 'account' | 'deliveries' | 'data'): void {
    this.tab.set(tab);
    if (tab === 'deliveries' && !this.deliveryMeta()) void this.loadDeliveries();
  }

  async loadMovements(page = 1): Promise<void> {
    const customer = this.customer(); if (!customer || !this.canViewAccount()) return;
    const request = ++this.movementRequest;
    this.movementLoading.set(true); this.movementError.set(null);
    try {
      const response = await firstValueFrom(this.api.movements(customer.id, this.movementFilters(), page));
      if (request !== this.movementRequest) return;
      this.movements.set(response.data); this.movementMeta.set(response.meta); this.statement.set(response.statement);
    } catch (error) { if (request === this.movementRequest) this.movementError.set(customerErrorMessage(error, 'No se pudieron consultar los movimientos.')); }
    finally { if (request === this.movementRequest) this.movementLoading.set(false); }
  }

  filterMovements(from: string, to: string, type: string): void {
    if (from && to && from > to) { this.movementError.set('La fecha final debe ser posterior o igual a la inicial.'); return; }
    const known = type in this.movementLabels ? type as CustomerMovementType : undefined;
    this.movementFilters.set({ from: from || undefined, to: to || undefined, type: known, per_page: 25 });
    void this.loadMovements();
  }

  async loadDeliveries(page = 1): Promise<void> {
    const customer = this.customer(); if (!customer) return;
    const request = ++this.deliveryRequest;
    this.deliveryLoading.set(true); this.deliveryError.set(null);
    try {
      const response = await firstValueFrom(this.api.deliveries(customer.id, page));
      if (request !== this.deliveryRequest) return;
      this.deliveries.set(response.data); this.deliveryMeta.set(response.meta);
    } catch (error) { if (request === this.deliveryRequest) this.deliveryError.set(customerErrorMessage(error, 'No se pudieron consultar las entregas.')); }
    finally { if (request === this.deliveryRequest) this.deliveryLoading.set(false); }
  }

  async reloadAccount(): Promise<boolean> {
    const customer = this.customer(); if (!customer || !this.canViewAccount()) return false;
    this.accountLoading.set(true); this.accountError.set(null);
    try {
      const response = await firstValueFrom(this.api.account(customer.id));
      if (this.destroyRef.destroyed || this.customer()?.id !== customer.id) return false;
      this.account.set(response.data); return true;
    } catch (error) { if (!this.destroyRef.destroyed) this.accountError.set(customerErrorMessage(error, 'No se pudo actualizar el saldo.')); return false; }
    finally { if (!this.destroyRef.destroyed) this.accountLoading.set(false); }
  }

  async openOperation(mode: OperationSelection['mode'], movement: CustomerMovement | null = null): Promise<void> {
    if (this.operationBusy() || this.operationClosing() || this.operation() || this.accountLoading() || !(await this.reloadAccount())) return;
    if (this.operationClosing() || this.operation()) return;
    this.operation.set({ mode, movement });
  }

  operationSaved(): void {
    this.closeOperation(); this.message.set('La operación se registró correctamente.');
    void this.reloadAccount(); void this.loadMovements(this.movementMeta()?.current_page ?? 1);
  }

  closeOperation(): void {
    if (this.operationBusy()) return;
    this.operationClosing.set(true); this.operation.set(null);
  }

  operationDismissed(): void { this.operation.set(null); this.operationClosing.set(false); }

  isReversible(movement: CustomerMovement): boolean {
    return this.canReverse() && !movement.reversal_id && ['payment', 'adjustment_increase', 'adjustment_decrease'].includes(movement.type);
  }

  openStatus(trigger: HTMLElement): void {
    const customer = this.customer(); if (!customer) return;
    this.statusTrigger = trigger; this.statusError.set(null);
    const command = this.commands.get(`status:${customer.id}`);
    this.statusPending.set(command?.kind === 'status' ? command : null);
    this.nextStatus.set(command?.kind === 'status' ? command.body.status : customer.status === 'active' ? 'inactive' : 'active');
    this.statusDialog().nativeElement.showModal(); this.statusTitle().nativeElement.focus({ preventScroll: true });
  }

  closeStatus(event?: Event): void {
    event?.preventDefault(); if (this.statusBusy()) return;
    this.statusDialog().nativeElement.close(); this.statusTrigger?.focus({ preventScroll: true });
  }

  async changeStatus(): Promise<void> {
    const customer = this.customer(); if (!customer || this.statusBusy()) return;
    const owner = this.commands.owner();
    const command = this.statusPending() ?? { kind: 'status' as const, key: crypto.randomUUID(), body: { status: this.nextStatus() } };
    if (command.kind !== 'status') return;
    this.statusPending.set(command); this.commands.remember(`status:${customer.id}`, command); this.statusBusy.set(true); this.statusError.set(null);
    try {
      const response = await firstValueFrom(this.api.status(customer.id, command.body.status, command.key));
      if (this.destroyRef.destroyed || this.commands.owner() !== owner) return;
      this.customer.update((current) => current ? { ...current, status: response.data.status } : current);
      this.commands.forget(`status:${customer.id}`); this.statusPending.set(null); this.statusBusy.set(false); this.closeStatus();
      this.message.set(response.data.status === 'inactive' ? 'Cliente desactivado.' : 'Cliente activado.');
    } catch (error) {
      if (this.destroyRef.destroyed || this.commands.owner() !== owner) return;
      if (!hasUncertainCustomerResult(error)) { this.statusPending.set(null); this.commands.forget(`status:${customer.id}`); }
      this.statusError.set(customerErrorMessage(error, 'No se pudo actualizar el estado.'));
    } finally { if (!this.destroyRef.destroyed) this.statusBusy.set(false); }
  }

  private allowed(permission: string): boolean { return isAdminUser(this.auth.user()) || this.auth.user()?.permissions?.includes(permission) === true; }
}
