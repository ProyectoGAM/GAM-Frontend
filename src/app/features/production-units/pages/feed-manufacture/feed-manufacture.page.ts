import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonInput, IonSelect, IonSelectOption, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, businessOutline, checkmarkCircleOutline, informationCircleOutline, leafOutline } from 'ionicons/icons';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedManufacture, ManufactureCalculation, ManufactureRecipe, PendingManufacture } from '../../interfaces/feed-manufacture.interface';
import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { FeedManufactureService } from '../../services/feed-manufacture.service';
import { formatFeedKilograms, multiplyRecipeYield } from '../../services/feed-manufacture-quantity';
import { ProductionUnitsService } from '../../services/production-units.service';

@Component({
  selector: 'app-feed-manufacture-page',
  templateUrl: './feed-manufacture.page.html',
  styleUrl: './feed-manufacture.page.scss',
  imports: [RouterLink, ReactiveFormsModule, IonButton, IonIcon, IonInput, IonSelect, IonSelectOption, IonSpinner],
})
export class FeedManufacturePage implements OnInit {
  private readonly units = inject(ProductionUnitsService);
  private readonly service = inject(FeedManufactureService);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild<ElementRef<HTMLElement>>('stepTitle');
  private readonly unitId = Number(this.route.snapshot.paramMap.get('id'));
  private readonly plantId = Number(this.route.snapshot.paramMap.get('houseId'));
  private readonly owner = computed(() => `${this.auth.user()?.id ?? 'guest'}:${this.auth.session()?.id ?? 'personal'}`);
  private readonly initialOwner = this.owner();
  readonly returnLink = ['/administracion/unidades-productivas', this.unitId, 'galpon', this.plantId];
  readonly state = signal<'loading' | 'ready' | 'error' | 'forbidden' | 'notFound'>('loading');
  readonly plant = signal<PoultryHouseDetail | null>(null);
  readonly recipes = signal<ManufactureRecipe[]>([]);
  readonly catalogState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly step = signal<'configure' | 'review' | 'result'>('configure');
  readonly calculation = signal<ManufactureCalculation | null>(null);
  readonly result = signal<FeedManufacture | null>(null);
  readonly selectedRecipe = signal<ManufactureRecipe | null>(null);
  readonly multiplier = signal('1');
  readonly search = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly catalogError = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly pending = signal<PendingManufacture | null>(null);
  readonly uncertain = signal(false);
  readonly canOperate = computed(() => this.plant()?.status === 'operational' && this.owner() === this.initialOwner);
  readonly visibleRecipes = computed(() => {
    const search = this.search().trim().toLocaleLowerCase('es');
    return this.recipes().filter((recipe) => `${recipe.nombre} #${recipe.id}`.toLocaleLowerCase('es').includes(search)
      || recipe.id === this.selectedRecipe()?.id).map((recipe) => ({ ...recipe, yieldLabel: formatFeedKilograms(recipe.rendimiento_g) }));
  });
  readonly yieldLabel = computed(() => formatFeedKilograms(this.selectedRecipe()?.rendimiento_g ?? '0'));
  readonly quantityGrams = computed(() => {
    const recipe = this.selectedRecipe();
    return recipe ? multiplyRecipeYield(recipe.rendimiento_g, this.multiplier()) : null;
  });
  readonly multiplierError = computed(() => {
    const factor = this.multiplier().trim();
    if (!/^\d{1,12}$/.test(factor) || BigInt(factor) === 0n) return 'Ingresá un multiplicador entero mayor que cero.';
    return this.selectedRecipe() && !this.quantityGrams() ? 'El total supera la cantidad permitida para esta receta. Reducí el multiplicador.' : null;
  });
  readonly multiplierLabel = computed(() => this.quantityGrams() ? String(BigInt(this.multiplier().trim())) : null);
  readonly quantityLabel = computed(() => formatFeedKilograms(this.quantityGrams() ?? '0'));
  readonly reviewBasis = computed(() => {
    const calculation = this.calculation();
    return calculation ? `${formatFeedKilograms(calculation.rendimiento_g)} × ${calculation.factor}` : null;
  });
  readonly reviewQuantity = computed(() => formatFeedKilograms(this.pending()?.request.cantidad_g ?? this.calculation()?.cantidad_g ?? '0'));
  readonly reviewName = computed(() => this.selectedRecipe()?.nombre ?? `Receta #${this.pending()?.request.receta_id ?? ''}`);
  readonly requiredIngredients = computed(() => (this.calculation()?.ingredientes ?? []).map((ingredient) => ({
    ...ingredient, quantityLabel: formatFeedKilograms(ingredient.cantidad_requerida_g),
  })));
  readonly receipt = computed(() => {
    const result = this.result();
    if (!result) return null;
    return {
      ...result,
      quantityLabel: formatFeedKilograms(result.cantidad_g),
      beforeLabel: formatFeedKilograms(result.saldo_anterior_g),
      afterLabel: formatFeedKilograms(result.saldo_resultante_g),
      ingredients: result.ingredientes.map((ingredient) => ({
        ...ingredient, quantityLabel: formatFeedKilograms(ingredient.cantidad_requerida_g),
        allocations: result.distribucion.filter((line) => line.producto_id === ingredient.producto_id).map((line) => ({
          ...line, quantityLabel: formatFeedKilograms(line.cantidad_g),
        })),
      })),
    };
  });
  readonly form = new FormGroup({
    recipeId: new FormControl<number | null>(null),
    multiplier: new FormControl('1', { nonNullable: true }),
  });

  constructor() {
    addIcons({ arrowBackOutline, businessOutline, checkmarkCircleOutline, informationCircleOutline, leafOutline });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.multiplier.set(this.form.controls.multiplier.value);
      this.selectedRecipe.set(this.recipes().find((recipe) => recipe.id === this.form.controls.recipeId.value) ?? null);
      this.calculation.set(null);
      this.error.set(null);
    });
    effect(() => {
      if (this.owner() === this.initialOwner) return;
      this.service.forgetPending(this.initialOwner, this.plantId);
      this.pending.set(null);
      this.result.set(null);
      this.calculation.set(null);
      this.plant.set(null);
      this.state.set('forbidden');
    });
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    if (this.owner() !== this.initialOwner) return;
    if (![this.unitId, this.plantId].every((id) => Number.isSafeInteger(id) && id > 0)) {
      this.state.set('notFound');
      return;
    }
    this.state.set('loading');
    this.units.getPoultryHouseById(this.plantId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        if (this.owner() !== this.initialOwner) return;
        if (data.type !== 'feed' || data.production_unit_id !== this.unitId) { this.state.set('notFound'); return; }
        this.plant.set(data);
        this.state.set('ready');
        const pending = this.service.readPending(this.initialOwner, this.plantId);
        if (pending) {
          this.pending.set(pending);
          this.uncertain.set(true);
          this.setStep('review');
        } else if (data.status === 'operational') this.loadRecipes();
      },
      error: (error: unknown) => {
        if (this.owner() !== this.initialOwner) return;
        this.state.set(error instanceof HttpErrorResponse && [401, 403].includes(error.status) ? 'forbidden'
          : error instanceof HttpErrorResponse && error.status === 404 ? 'notFound' : 'error');
      },
    });
  }

  loadRecipes(): void {
    if (this.busy() || this.owner() !== this.initialOwner) return;
    this.catalogState.set('loading');
    this.catalogError.set(null);
    this.service.recipes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (recipes) => {
        if (this.owner() !== this.initialOwner) return;
        this.recipes.set(recipes.filter((recipe) => recipe.estado === 'active'));
        this.selectedRecipe.set(this.recipes().find((recipe) => recipe.id === this.form.controls.recipeId.value) ?? null);
        this.catalogState.set('ready');
      },
      error: (error: unknown) => {
        if (this.owner() !== this.initialOwner) return;
        this.catalogState.set('error');
        this.catalogError.set(this.errorMessage(error, 'No se pudieron cargar las recetas. Revisá tu conexión e intentá nuevamente.'));
      },
    });
  }

  review(): void {
    if (this.busy() || this.pending() || !this.canOperate() || this.catalogState() !== 'ready') return;
    this.submitted.set(true);
    const recipe = this.selectedRecipe();
    const grams = this.quantityGrams();
    if (!recipe || !grams || this.multiplierError()) return;
    this.busy.set(true);
    this.error.set(null);
    this.calculation.set(null);
    this.form.disable({ emitEvent: false });
    this.service.calculate(recipe.id, grams).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (calculation) => {
        if (this.owner() !== this.initialOwner) return;
        this.busy.set(false);
        this.form.enable({ emitEvent: false });
        this.calculation.set(calculation);
        this.setStep('review');
      },
      error: (error: unknown) => {
        if (this.owner() !== this.initialOwner) return;
        this.busy.set(false);
        this.form.enable({ emitEvent: false });
        this.error.set(this.errorMessage(error, 'No se pudo calcular la elaboración. Revisá la receta y la cantidad.'));
        if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) this.loadRecipes();
      },
    });
  }

  edit(): void {
    if (this.busy() || this.pending()) return;
    this.error.set(null);
    this.setStep('configure');
    if (!this.calculation() || this.catalogState() !== 'ready') this.loadRecipes();
  }

  confirm(): void {
    // Replaying a pending operation is allowed even if the plant changed state after the original request.
    if (this.busy() || this.owner() !== this.initialOwner || this.step() !== 'review') return;
    let pending = this.pending();
    if (!pending) {
      const calculation = this.calculation();
      if (!calculation || !this.canOperate()) return;
      pending = { key: crypto.randomUUID(), request: {
        receta_id: calculation.receta_id, planta_id: this.plantId, cantidad_g: calculation.cantidad_g,
      } };
      this.service.rememberPending(this.initialOwner, pending);
      this.pending.set(pending);
    }
    this.busy.set(true);
    this.error.set(null);
    this.service.manufacture(pending.request, pending.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        if (this.owner() !== this.initialOwner) return;
        this.clearPending();
        this.busy.set(false);
        this.result.set(result);
        this.setStep('result');
      },
      error: (error: unknown) => {
        if (this.owner() !== this.initialOwner) return;
        this.busy.set(false);
        if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500 || error.status === 408) {
          this.uncertain.set(true);
          this.error.set('No pudimos confirmar el resultado. Consultá nuevamente para recuperar esta misma operación sin duplicarla.');
        } else {
          this.clearPending();
          this.calculation.set(null);
          this.error.set(this.errorMessage(error, 'No se pudo registrar la elaboración. Revisá los datos e intentá nuevamente.'));
        }
      },
    });
  }

  private clearPending(): void {
    this.service.forgetPending(this.initialOwner, this.plantId);
    this.pending.set(null);
    this.uncertain.set(false);
  }

  private setStep(step: 'configure' | 'review' | 'result'): void {
    this.step.set(step);
    afterNextRender(() => this.title()?.nativeElement.focus(), { injector: this.injector });
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    if ([401, 403].includes(error.status)) return 'No tenés permiso para realizar esta acción. Consultá con un administrador.';
    if (error.status === 419) return 'Tu sesión venció. Volvé a ingresar antes de continuar.';
    if (error.status === 429) return 'Hay demasiados intentos. Esperá un momento y volvé a intentar.';
    if (error.status === 404) return 'La receta o la planta ya no está disponible. Volvé a elegir los datos.';
    if ([409, 422].includes(error.status)) {
      const body: unknown = error.error;
      const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : null;
      return message ?? 'El stock, la receta o el estado de la planta cambió. Volvé a revisar la elaboración.';
    }
    return fallback;
  }
}
