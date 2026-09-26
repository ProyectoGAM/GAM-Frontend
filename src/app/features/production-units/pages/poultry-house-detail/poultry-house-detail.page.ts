import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  businessOutline,
  informationCircleOutline,
  pencilOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  AlertController,
  IonButton,
  IonIcon,
  IonSpinner,
} from '@ionic/angular';

import { FeedStockDetailComponent } from '../../components/feed-stock-detail/feed-stock-detail.component';
import { PoultryHouseDetailContentComponent } from '../../components/poultry-house-detail-content/poultry-house-detail-content.component';
import {
  FeedStock,
  HouseFlock,
  InventoryIngredient,
  PoultryHouse,
  PoultryHouseDetail as PoultryHouseDetailData,
} from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';

type DetailState = 'loading' | 'success' | 'offline' | 'forbidden' | 'notFound' | 'error';
type RelatedState = 'loading' | 'success' | 'error';
type CatalogState = 'idle' | 'loading' | 'success' | 'error';

const birdCountFormatter = new Intl.NumberFormat('es-UY');
const quantityFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 });

@Component({
  selector: 'app-poultry-house-detail-page',
  templateUrl: './poultry-house-detail.page.html',
  styleUrl: './poultry-house-detail.page.scss',
  imports: [
    IonButton,
    IonIcon,
    IonSpinner,
    RouterLink,
    FeedStockDetailComponent,
    PoultryHouseDetailContentComponent,
  ],
})
export class PoultryHouseDetailPage implements OnInit {
  private readonly service = inject(ProductionUnitsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly alertController = inject(AlertController);
  readonly unitId = Number(this.route.snapshot.paramMap.get('id'));
  readonly state = signal<DetailState>('loading');
  readonly house = signal<PoultryHouseDetailData | null>(null);
  readonly flocks = signal<HouseFlock[]>([]);
  readonly flocksState = signal<RelatedState>('loading');
  readonly feedStock = signal<FeedStock | null>(null);
  readonly feedStockState = signal<RelatedState>('loading');
  readonly isInfoOpen = signal(false);
  readonly isDeleting = signal(false);
  readonly deleteError = signal<string | null>(null);
  readonly ingredientFormOpen = signal(false);
  readonly inventoryIngredients = signal<InventoryIngredient[]>([]);
  readonly catalogState = signal<CatalogState>('idle');
  readonly isAddingIngredient = signal(false);
  readonly ingredientMessage = signal<string | null>(null);
  private readonly ingredientIdempotencyKey = signal<string | null>(null);
  readonly capacityLabel = computed(() => {
    const house = this.house();
    if (!house || house.type !== 'poultry') return 'No aplica';
    if (house.bird_capacity === null) return 'No disponible';
    return `${birdCountFormatter.format(house.bird_capacity)} aves`;
  });
  readonly occupancyLabel = computed(() => {
    const occupancy = this.house()?.current_occupancy;
    return typeof occupancy === 'number' ? `${birdCountFormatter.format(occupancy)} aves` : 'No disponible';
  });
  readonly availableCapacityLabel = computed(() => {
    const house = this.house();
    if (!house || house.type !== 'poultry' || house.bird_capacity === null || typeof house.current_occupancy !== 'number') {
      return 'No disponible';
    }
    return `${birdCountFormatter.format(Math.max(0, house.bird_capacity - house.current_occupancy))} plazas`;
  });
  readonly occupancyPercent = computed(() => {
    const house = this.house();
    if (!house || house.type !== 'poultry' || !house.bird_capacity || typeof house.current_occupancy !== 'number') return null;
    return Math.min(100, Math.max(0, (house.current_occupancy / house.bird_capacity) * 100));
  });
  readonly currentFlocks = computed(() => this.flocks().filter(
    (flock) => flock.status === 'active' || flock.status === 'quarantined',
  ));
  readonly stockRows = computed(() => {
    const houseId = this.house()?.id;
    return (this.feedStock()?.items ?? []).map((item) => {
      const detail = item.details.find((row) => row.poultry_house_id === houseId);
      const quantity = detail?.stock_g ?? item.total_g;
      const amountInKg = Number(quantity) / 1000;
      const unit = Math.abs(Number(quantity)) >= 1000 ? 'kg' : 'g';
      return {
        id: item.product_id,
        name: item.product.name,
        sku: item.product.sku,
        quantity: quantityFormatter.format(unit === 'kg' ? amountInKg : Number(quantity)),
        unit,
        negative: Number(quantity) < 0,
      };
    });
  });
  readonly availableIngredients = computed(() => {
    const stockedIds = new Set(this.feedStock()?.items.map((item) => item.product_id) ?? []);
    return this.inventoryIngredients().filter((product) => !stockedIds.has(product.id));
  });
  readonly canDelete = computed(() => {
    const house = this.house();
    if (!house || house.status === 'inactive' || this.isDeleting()) return false;
    return house.type === 'feed' || house.current_occupancy === 0;
  });
  readonly deleteBlockReason = computed(() => {
    const house = this.house();
    if (house?.status === 'inactive') return 'Esta instalación ya está inactiva.';
    if (house?.type === 'poultry' && typeof house.current_occupancy === 'number' && house.current_occupancy > 0) {
      return 'No se puede eliminar mientras haya aves alojadas. Trasladá o finalizá los lotes primero.';
    }
    return 'No se pudo comprobar la ocupación actual. Volvé a cargar la instalación antes de eliminarla.';
  });
  readonly ingredientForm = new FormGroup({
    productId: new FormControl<number | null>(null, { validators: [Validators.required] }),
    quantity: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(?=.*[1-9])\d+(?:\.\d{1,6})?$/)] }),
    unit: new FormControl<'g' | 'kg'>('kg', { nonNullable: true }),
  });

  constructor() {
    addIcons({ arrowBackOutline, businessOutline, informationCircleOutline, pencilOutline, trashOutline });
    this.ingredientForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.ingredientIdempotencyKey.set(null));
  }

  ngOnInit(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  retryRelated(): void {
    const house = this.house();
    if (!house) return;
    if (house.type === 'poultry') this.loadFlocks(house.id);
    else this.loadFeedStock(house.id);
  }

  houseStatus(status: PoultryHouse['status']): string {
    return ({
      operational: 'Operativo',
      maintenance: 'En mantenimiento',
      out_of_service: 'Fuera de servicio',
      inactive: 'Inactivo',
    })[status];
  }

  async showUnavailableFlow(flow: 'edit' | 'flock'): Promise<void> {
    const alert = await this.alertController.create({
      header: flow === 'edit' ? 'Edición pendiente' : 'Alta de lotes pendiente',
      message: flow === 'edit'
        ? 'La pantalla para editar instalaciones todavía no está disponible.'
        : 'El alta de lotes requiere seleccionar un plan publicado. Ese flujo todavía no está disponible en esta aplicación.',
      buttons: ['Entendido'],
    });
    await alert.present();
  }

  toggleInfo(): void {
    this.isInfoOpen.update((open) => !open);
  }

  async deactivate(): Promise<void> {
    const house = this.house();
    if (!house || !this.canDelete()) return;
    const alert = await this.alertController.create({
      header: `Eliminar ${house.type === 'feed' ? 'planta de ración' : 'galpón'}`,
      message: `“${house.name}” quedará inactivo. Podrás consultar su registro histórico.`,
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', role: 'confirm' }],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm' || !this.canDelete()) return;

    this.isDeleting.set(true);
    this.deleteError.set(null);
    this.service.updatePoultryHouseStatus(house.id, 'inactive').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        this.house.set({ ...house, ...data });
        this.isDeleting.set(false);
        this.isInfoOpen.set(false);
      },
      error: (error: unknown) => {
        this.isDeleting.set(false);
        this.deleteError.set(error instanceof HttpErrorResponse && error.status === 409
          ? 'La ocupación o el estado cambió. Revisá los datos e intentá nuevamente.'
          : 'No se pudo eliminar la instalación. Intentá nuevamente.');
        if (error instanceof HttpErrorResponse && error.status === 409) this.load();
      },
    });
  }

  toggleIngredientForm(): void {
    this.ingredientFormOpen.update((open) => !open);
    this.ingredientMessage.set(null);
    if (this.ingredientFormOpen()) this.loadInventoryIngredients();
  }

  retryInventoryIngredients(): void {
    this.loadInventoryIngredients();
  }

  addIngredient(): void {
    if (this.ingredientForm.invalid || this.isAddingIngredient()) {
      this.ingredientForm.markAllAsTouched();
      return;
    }
    const house = this.house();
    if (!house || house.type !== 'feed' || this.feedStockState() !== 'success' || this.catalogState() !== 'success') return;
    const form = this.ingredientForm.getRawValue();
    const product = this.availableIngredients().find((ingredient) => ingredient.id === form.productId);
    if (!product) {
      this.ingredientMessage.set('Seleccioná un ingrediente disponible en Inventario.');
      this.ingredientForm.controls.productId.setValue(null);
      return;
    }
    this.isAddingIngredient.set(true);
    this.ingredientMessage.set(null);
    const idempotencyKey = this.ingredientIdempotencyKey() ?? crypto.randomUUID();
    this.ingredientIdempotencyKey.set(idempotencyKey);
    this.service.createFeedIngredient(house.id, {
      sku: product.sku,
      nombre: product.name,
      cantidad: String(form.quantity),
      unidad: form.unit,
    }, idempotencyKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isAddingIngredient.set(false);
        this.ingredientForm.reset({ productId: null, quantity: '', unit: 'kg' });
        this.ingredientIdempotencyKey.set(null);
        this.ingredientFormOpen.set(false);
        this.ingredientMessage.set('Ingrediente agregado.');
        this.loadFeedStock(house.id);
      },
      error: (error: unknown) => {
        this.isAddingIngredient.set(false);
        this.ingredientMessage.set(error instanceof HttpErrorResponse && error.status === 409
          ? 'El ingrediente o los datos de stock cambiaron. Actualizá la lista e intentá nuevamente.'
          : 'No se pudo agregar el ingrediente. Revisá tus permisos y los datos.');
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.loadFeedStock(house.id);
          this.loadInventoryIngredients();
        }
      },
    });
  }

  private load(): void {
    const unitId = this.unitId;
    const houseId = Number(this.route.snapshot.paramMap.get('houseId'));
    if (!Number.isInteger(unitId) || unitId < 1 || !Number.isInteger(houseId) || houseId < 1) {
      this.house.set(null);
      this.state.set('notFound');
      return;
    }

    this.state.set('loading');
    this.house.set(null);
    this.service.getPoultryHouseById(houseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        if (data.production_unit_id !== unitId) {
          this.house.set(null);
          this.state.set('notFound');
          return;
        }
        this.house.set(data);
        this.state.set('success');
        if (data.type === 'poultry') this.loadFlocks(data.id);
        else this.loadFeedStock(data.id);
      },
      error: (error: unknown) => this.state.set(this.errorState(error)),
    });
  }

  private loadFlocks(houseId: number): void {
    this.flocksState.set('loading');
    this.service.houseFlocks(houseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (flocks) => { this.flocks.set(flocks); this.flocksState.set('success'); },
      error: () => this.flocksState.set('error'),
    });
  }

  private loadFeedStock(houseId: number): void {
    this.feedStockState.set('loading');
    this.service.feedStock(houseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => { this.feedStock.set(data); this.feedStockState.set('success'); },
      error: () => this.feedStockState.set('error'),
    });
  }

  private loadInventoryIngredients(): void {
    this.catalogState.set('loading');
    this.service.inventoryIngredients().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (products) => { this.inventoryIngredients.set(products); this.catalogState.set('success'); },
      error: () => this.catalogState.set('error'),
    });
  }

  private errorState(error: unknown): DetailState {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) return 'forbidden';
      if (error.status === 404) return 'notFound';
      if (error.status === 0) return 'offline';
    }

    return 'error';
  }
}
