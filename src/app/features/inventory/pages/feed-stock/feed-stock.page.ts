import { Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, leafOutline, informationCircleOutline, settingsOutline, warningOutline } from 'ionicons/icons';

import { AuthStore } from '../../../../core/auth/auth.store';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { ProductionUnit } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FeedStockBalance, FeedStockFilters, FeedStockRecipe } from '../../interfaces/feed-stock';
import { PaginatedResponse } from '../../interfaces/inventory';
import { FeedStockApi } from '../../services/feed-stock.api';
import { feedKilogramInput, feedMinimumGrams, formatFeedStock } from '../../services/feed-stock-format';
import { inventoryErrorMessage } from '../../services/inventory-errors';
import { LoadState } from '../../types/inventory-state.type';
import { FeedStockStatus } from '../../types/feed-stock-status.type';

const STATUS_LABELS: Record<FeedStockStatus, string> = {
  sin_configurar: 'Sin mínimo', suficiente: 'Suficiente', en_minimo: 'En mínimo', por_debajo: 'Por debajo del mínimo',
};

@Component({
  selector: 'app-inventory-feed-stock',
  templateUrl: './feed-stock.page.html',
  styleUrl: './feed-stock.page.scss',
  imports: [ReactiveFormsModule, RouterLink, IonIcon, SearchableSelectComponent],
})
export class FeedStockPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(FeedStockApi);
  private readonly unitsApi = inject(ProductionUnitsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly canManage = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('inventory.manage') === true);
  readonly canViewRecipes = computed(() => this.auth.isAdmin() || this.auth.user()?.permissions.includes('feed-recipes.view') === true);
  readonly units = signal<ProductionUnit[]>([]);
  readonly unitsState = signal<LoadState>('idle');
  readonly unitsError = signal<string | null>(null);
  readonly selectedUnit = signal<number | null>(null);
  readonly selectedUnitName = computed(() => this.units().find((unit) => unit.id === this.selectedUnit())?.name ?? '');
  readonly recipes = signal<FeedStockRecipe[]>([]);
  readonly recipesState = signal<LoadState>('idle');
  readonly recipesError = signal<string | null>(null);
  readonly recipeOptions = computed(() => this.recipes().map((recipe) => ({ value: recipe.id,
    label: `${recipe.nombre} · #${recipe.id}${recipe.estado === 'inactive' ? ' · Inactiva' : ''}` })));
  readonly balances = signal<FeedStockBalance[]>([]);
  readonly meta = signal<PaginatedResponse<FeedStockBalance>['meta'] | null>(null);
  readonly state = signal<LoadState>('idle');
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly attentionCount = computed(() => this.balances().filter((balance) => balance.requiere_atencion).length);
  readonly rows = computed(() => this.balances().map((balance) => ({ balance,
    available: formatFeedStock(balance.saldo_g),
    minimum: balance.minimo_g === null ? 'Sin configurar' : formatFeedStock(balance.minimo_g),
    status: STATUS_LABELS[balance.estado_stock], negative: BigInt(balance.saldo_g) < 0n,
  })));
  readonly filters = new FormGroup({ recipe: new FormControl('', { nonNullable: true }),
    attention: new FormControl(false, { nonNullable: true }) });
  readonly minimumRecipe = new FormControl('', { nonNullable: true });
  readonly minimumValue = new FormControl('', { nonNullable: true });
  readonly minimumForm = new FormGroup({ recipe: this.minimumRecipe, minimum: this.minimumValue });
  readonly minimumBalance = signal<FeedStockBalance | null>(null);
  readonly minimumRecipeOptions = computed(() => {
    const balance = this.minimumBalance();
    const recipes = this.recipes();
    return balance && !recipes.some((recipe) => recipe.id === balance.receta_id)
      ? [...recipes, { id: balance.receta_id, nombre: balance.nombre_receta, estado: balance.estado_receta }]
      : recipes;
  });
  readonly minimumLoading = signal(false);
  readonly minimumSaving = signal(false);
  readonly minimumError = signal<string | null>(null);
  readonly format = formatFeedStock;
  private appliedFilters: Pick<FeedStockFilters, 'receta_id' | 'requiere_atencion'> = {};
  private loadVersion = 0;
  private dialogVersion = 0;
  private returnFocusTo: HTMLElement | null = null;
  @ViewChild('minimumDialog', { static: true }) private readonly minimumDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('minimumInput', { static: true }) private readonly minimumInput!: ElementRef<HTMLInputElement>;

  constructor() {
    addIcons({ arrowBackOutline, leafOutline, informationCircleOutline, settingsOutline, warningOutline });
    this.destroyRef.onDestroy(() => { this.loadVersion++; this.dialogVersion++; });
    void this.loadUnits();
    if (this.canViewRecipes()) void this.loadRecipes();
  }

  async loadUnits(): Promise<void> {
    this.unitsState.set('loading'); this.unitsError.set(null);
    try {
      const units = await firstValueFrom(this.unitsApi.listAll());
      if (this.destroyRef.destroyed) return;
      this.units.set(units); this.unitsState.set(units.length ? 'success' : 'empty');
      if (this.selectedUnit() === null && units[0]) { this.selectedUnit.set(units[0].id); await this.load(); }
    } catch (error) {
      if (this.destroyRef.destroyed) return;
      this.unitsState.set('error');
      this.unitsError.set(inventoryErrorMessage(error, 'No se pudieron cargar las unidades productivas.'));
    }
  }

  async loadRecipes(): Promise<void> {
    if (!this.canViewRecipes()) return;
    this.recipesState.set('loading'); this.recipesError.set(null);
    try {
      const recipes = await firstValueFrom(this.api.recipes());
      if (this.destroyRef.destroyed) return;
      this.recipes.set(recipes); this.recipesState.set(recipes.length ? 'success' : 'empty');
    } catch (error) {
      if (this.destroyRef.destroyed) return;
      this.recipesState.set('error');
      this.recipesError.set(inventoryErrorMessage(error, 'No se pudo cargar el catálogo de recetas. Los saldos siguen disponibles.'));
    }
  }

  async chooseUnit(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLSelectElement) || this.minimumSaving()) return;
    this.closeMinimum();
    this.selectedUnit.set(event.target.value ? Number(event.target.value) : null);
    this.success.set(null);
    await this.load();
  }

  async load(page = 1): Promise<void> {
    const version = ++this.loadVersion;
    this.balances.set([]); this.meta.set(null); this.error.set(null);
    const unit = this.selectedUnit();
    if (unit === null) { this.state.set('idle'); return; }
    this.state.set('loading');
    try {
      const response = await firstValueFrom(this.api.balances({ up_id: unit, ...this.appliedFilters, page }));
      if (version !== this.loadVersion) return;
      this.balances.set(response.data); this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.loadVersion) return;
      this.state.set('error'); this.error.set(inventoryErrorMessage(error, 'No se pudo cargar el stock de raciones.'));
    }
  }

  applyFilters(): void {
    const values = this.filters.getRawValue();
    this.appliedFilters = { receta_id: values.recipe ? Number(values.recipe) : undefined,
      requiere_atencion: values.attention ? true : undefined };
    void this.load();
  }

  clearFilters(): void {
    this.filters.reset(); this.appliedFilters = {}; void this.load();
  }

  openMinimum(event: Event, balance: FeedStockBalance | null = null): void {
    if (!this.canManage() || this.selectedUnit() === null || this.minimumSaving()) return;
    this.dialogVersion++;
    this.minimumBalance.set(balance); this.minimumLoading.set(false); this.minimumError.set(null);
    this.minimumValue.reset(balance?.minimo_g === null || !balance ? '' : feedKilogramInput(balance.minimo_g));
    this.minimumRecipe.reset(balance ? String(balance.receta_id) : '');
    this.returnFocusTo = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.minimumDialog.nativeElement.showModal();
    if (balance) this.minimumInput.nativeElement.focus();
  }

  async chooseMinimumRecipe(): Promise<void> {
    if (this.minimumSaving()) return;
    const version = ++this.dialogVersion;
    const unit = this.selectedUnit(); const recipe = Number(this.minimumRecipe.value);
    this.minimumBalance.set(null); this.minimumError.set(null); this.minimumValue.reset();
    this.minimumLoading.set(false);
    if (unit === null || !recipe) return;
    this.minimumLoading.set(true);
    try {
      const response = await firstValueFrom(this.api.balance(unit, recipe));
      if (version !== this.dialogVersion) return;
      this.minimumBalance.set(response.data);
      this.minimumValue.setValue(response.data.minimo_g === null ? '' : feedKilogramInput(response.data.minimo_g));
    } catch (error) {
      if (version !== this.dialogVersion) return;
      this.minimumError.set(inventoryErrorMessage(error, 'No se pudo consultar el saldo de la receta.'));
    } finally { if (version === this.dialogVersion) this.minimumLoading.set(false); }
  }

  closeMinimum(): void {
    if (this.minimumSaving()) return;
    this.dialogVersion++;
    this.minimumDialog.nativeElement.close();
    if (this.returnFocusTo?.isConnected) this.returnFocusTo.focus();
    this.returnFocusTo = null;
  }

  onDialogCancel(event: Event): void { event.preventDefault(); this.closeMinimum(); }

  async saveMinimum(): Promise<void> {
    const balance = this.minimumBalance();
    if (!this.canManage() || !balance || this.minimumSaving() || this.minimumLoading()) return;
    const grams = feedMinimumGrams(this.minimumValue.value);
    if (grams === undefined) {
      this.minimumError.set('Usa una cantidad desde cero, con hasta 3 decimales y un máximo de 999.999.999,999 kg.'); return;
    }
    this.minimumSaving.set(true); this.minimumError.set(null); this.success.set(null);
    try {
      await firstValueFrom(this.api.setMinimum(balance.up_id, balance.receta_id, grams));
      if (this.destroyRef.destroyed) return;
      this.minimumSaving.set(false); this.closeMinimum();
      this.success.set(grams === null ? 'Mínimo de ración quitado.' : 'Mínimo de ración actualizado.');
      await this.load();
    } catch (error) {
      if (!this.destroyRef.destroyed) this.minimumError.set(inventoryErrorMessage(error, 'No se pudo guardar el mínimo.'));
    } finally { if (!this.destroyRef.destroyed) this.minimumSaving.set(false); }
  }
}
