import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, chevronForwardOutline, eggOutline, funnelOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { EggDonationDialogComponent } from '../../components/egg-donation-dialog/egg-donation-dialog.component';
import { EggDonationUnit } from '../../interfaces/egg-donation';
import { EggStockStatus, EggStockTransaction, PaginatedResponse } from '../../interfaces/inventory';
import { EggStockApi } from '../../services/egg-stock.api';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { formatQuantity } from '../../services/inventory-format';
import { LoadState } from '../../types/inventory-state.type';

const EMPTY_FILTERS = { status: '' as '' | EggStockStatus, date_from: '', date_to: '' };

@Component({
  selector: 'app-egg-donations',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, IonIcon, FilterDialogComponent, EggDonationDialogComponent],
  templateUrl: './egg-donations.page.html',
  styleUrl: './egg-donations.page.scss',
})
export class EggDonationsPage {
  private readonly api = inject(EggStockApi);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly unitContext = inject(AdminUnitContextService);
  readonly canMove = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.move') === true);
  readonly canRead = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('egg-stock.view') === true);
  readonly units = signal<EggDonationUnit[]>([]);
  readonly unit = computed(() => this.unitContext.state() === 'ready' && (this.canRead() || this.canMove()) ? this.unitContext.selectedId() : null);
  readonly selectedUnit = computed(() => this.units().find((item) => item.id === this.unit()) ?? null);
  readonly canDonate = computed(() => this.canMove() && this.unitsState() === 'success' && this.selectedUnit() !== null);
  readonly unitsState = signal<LoadState>('idle');
  readonly unitsError = signal<string | null>(null);
  readonly balance = signal<number | null>(null);
  readonly balanceState = signal<LoadState>('idle');
  readonly balanceError = signal<string | null>(null);
  readonly balanceLabel = computed(() => this.balance() === null ? null : formatQuantity(String(this.balance())));
  readonly records = signal<EggStockTransaction[]>([]);
  readonly rows = computed(() => this.records().map((item) => ({ item, quantity: formatQuantity(String(item.quantity)) })));
  readonly meta = signal<PaginatedResponse<EggStockTransaction>['meta'] | null>(null);
  readonly historyState = signal<LoadState>('idle');
  readonly historyError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly dialogOpen = signal(false);
  readonly appliedFilters = signal({ ...EMPTY_FILTERS });
  readonly activeFilterCount = computed(() => Object.values(this.appliedFilters()).filter(Boolean).length);
  readonly filterError = signal<string | null>(null);
  readonly filters = new FormGroup({
    status: new FormControl<'' | EggStockStatus>('', { nonNullable: true }),
    date_from: new FormControl('', { nonNullable: true }),
    date_to: new FormControl('', { nonNullable: true }),
  });
  private unitsVersion = 0;
  private balanceVersion = 0;
  private historyVersion = 0;
  @ViewChild(FilterDialogComponent, { static: true }) private readonly filterDialog!: FilterDialogComponent;
  @ViewChild(EggDonationDialogComponent, { static: true }) private readonly donationDialog!: EggDonationDialogComponent;

  constructor() {
    addIcons({ addOutline, chevronForwardOutline, eggOutline, funnelOutline });
    effect(() => {
      const actor = this.auth.user()?.id;
      untracked(() => {
        this.unitsVersion++;
        this.invalidateUnit();
        this.units.set([]);
        this.unitsState.set('idle');
        this.unitsError.set(null);
        this.notice.set(null);
        this.appliedFilters.set({ ...EMPTY_FILTERS });
        this.filters.reset(EMPTY_FILTERS);
        this.filterError.set(null);
        this.filterDialog?.close();
        if (actor && (this.canRead() || this.canMove())) void this.loadUnits();
      });
    });
    effect(() => {
      const actor = this.auth.user()?.id;
      const unit = this.unit();
      const canRead = this.canRead();
      untracked(() => {
        this.invalidateUnit();
        this.notice.set(null);
        this.filterDialog?.close();
        if (actor && unit && canRead) { void this.loadBalance(); void this.load(); }
      });
    });
  }

  async loadUnits(): Promise<void> {
    const version = ++this.unitsVersion;
    this.unitsState.set('loading');
    this.unitsError.set(null);
    const units = new Map<number, EggDonationUnit>();
    try {
      let lastPage = 1;
      for (let page = 1; page <= lastPage; page++) {
        const response = await firstValueFrom(this.api.donationUnits('', page));
        if (version !== this.unitsVersion || this.destroyRef.destroyed) return;
        response.data.forEach((item) => units.set(item.id, item));
        lastPage = response.meta.last_page;
      }
      const items = [...units.values()];
      this.units.set(items);
      this.unitsState.set(items.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.unitsVersion || this.destroyRef.destroyed) return;
      this.unitsState.set('error');
      this.unitsError.set(inventoryErrorMessage(error, 'No se pudieron cargar las unidades productivas.'));
    }
  }

  async loadBalance(): Promise<void> {
    const version = ++this.balanceVersion;
    const unit = this.unit();
    if (!unit || !this.canRead()) return;
    this.balance.set(null);
    this.balanceState.set('loading');
    this.balanceError.set(null);
    try {
      const response = await firstValueFrom(this.api.balance(unit));
      if (version !== this.balanceVersion || this.destroyRef.destroyed) return;
      this.balance.set(response.data.balance);
      this.balanceState.set('success');
    } catch (error) {
      if (version !== this.balanceVersion || this.destroyRef.destroyed) return;
      this.balanceState.set('error');
      this.balanceError.set(inventoryErrorMessage(error, 'No se pudo consultar el saldo de huevos.'));
    }
  }

  async load(page = 1): Promise<void> {
    const version = ++this.historyVersion;
    const unit = this.unit();
    if (!unit || !this.canRead()) return;
    this.historyState.set('loading');
    this.historyError.set(null);
    this.records.set([]);
    this.meta.set(null);
    const filters = this.appliedFilters();
    try {
      const response = await firstValueFrom(this.api.movements(unit, {
        type: 'donation', status: filters.status || undefined,
        date_from: filters.date_from || undefined, date_to: filters.date_to || undefined,
        page, per_page: 20,
      }));
      if (version !== this.historyVersion || this.destroyRef.destroyed) return;
      this.records.set(response.data);
      this.meta.set(response.meta);
      this.historyState.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.historyVersion || this.destroyRef.destroyed) return;
      this.historyState.set('error');
      this.historyError.set(inventoryErrorMessage(error, 'No se pudo cargar el historial de donaciones.'));
    }
  }

  openFilters(trigger: HTMLElement): void {
    if (!this.unit() || !this.canRead() || this.dialogOpen()) return;
    this.filters.reset(this.appliedFilters());
    this.filterError.set(null);
    this.filterDialog.open(trigger);
  }

  clearDraftFilters(): void { this.filters.reset(EMPTY_FILTERS); this.filterError.set(null); }

  async applyFilters(): Promise<void> {
    const filters = this.filters.getRawValue();
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
      this.filterError.set('La fecha desde debe ser anterior o igual a la fecha hasta.');
      return;
    }
    this.filterError.set(null);
    this.appliedFilters.set(filters);
    this.filterDialog.close();
    await this.load();
  }

  clearFilters(): void { this.clearDraftFilters(); void this.applyFilters(); }

  openDonation(trigger: HTMLElement): void {
    const unit = this.selectedUnit();
    if (!unit || !this.canDonate() || this.dialogOpen()) return;
    this.notice.set(null);
    this.donationDialog.open(unit, this.balanceState() === 'success' ? this.balance() : null, trigger);
  }

  onSaved(unitId: number): void {
    if (unitId !== this.unit()) return;
    this.notice.set('Donación registrada y descontada del stock de ' + this.selectedUnit()?.name + '.');
    void this.loadBalance();
    void this.load();
  }

  private invalidateUnit(): void {
    this.balanceVersion++;
    this.historyVersion++;
    this.balance.set(null);
    this.balanceState.set('idle');
    this.balanceError.set(null);
    this.records.set([]);
    this.meta.set(null);
    this.historyState.set('idle');
    this.historyError.set(null);
  }
}
