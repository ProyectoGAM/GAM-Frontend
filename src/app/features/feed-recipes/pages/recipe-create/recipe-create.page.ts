import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, DestroyRef, ElementRef, HostListener, Injector, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AlertController, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, globeOutline, informationCircleOutline, trashOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { hasFeedRecipesPermission } from '../../../../core/auth/access-policy';
import { SearchableSelectComponent } from '../../../../shared/ui/searchable-select/searchable-select.component';
import { CreateFeedRecipe, RecipeMaterial } from '../../interfaces/create-feed-recipe';
import { FeedRecipe } from '../../interfaces/feed-recipe';
import { FeedRecipesApi } from '../../services/feed-recipes.api';
import { distinctRecipeMaterials, recipeGrams, recipeName, recipeQuantity } from '../../services/recipe-create-form';
import { recipeErrorMessage, recipeFilters, recipeKilograms, recipeQuery } from '../../services/recipe-presentation';

const RECIPES_PATH = '/administracion/manejo-lotes/Recetas';

@Component({
  selector: 'app-recipe-create',
  imports: [ReactiveFormsModule, RouterLink, IonIcon, SearchableSelectComponent],
  templateUrl: './recipe-create.page.html',
  styleUrl: './recipe-create.page.scss',
  host: { '[style.--recipe-keyboard-offset]': 'viewportBottom() + "px"' },
})
export class RecipeCreatePage {
  private readonly api = inject(FeedRecipesApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly alerts = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('recipeForm');
  readonly returnQuery = recipeQuery(recipeFilters(this.route.snapshot.queryParamMap));
  readonly canCreate = computed(() => this.auth.isAdmin() || hasFeedRecipesPermission(this.auth.user(), 'manage'));
  readonly canRead = computed(() => this.auth.isAdmin() || hasFeedRecipesPermission(this.auth.user(), 'view'));
  readonly materials = signal<RecipeMaterial[]>([]);
  readonly materialsLoading = signal(false);
  readonly materialsError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly uncertain = signal(false);
  readonly created = signal<FeedRecipe | null>(null);
  readonly error = signal<string | null>(null);
  readonly viewportBottom = signal(0);
  readonly locked = computed(() => this.saving() || this.uncertain() || !!this.created() || !this.canCreate());
  readonly ingredients = new FormArray([this.newIngredient()], { validators: [distinctRecipeMaterials] });
  readonly form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [recipeName, Validators.maxLength(160)] }),
    rendimiento: new FormControl('', { nonNullable: true, validators: [recipeQuantity] }),
    nota: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    ingredientes: this.ingredients,
  });
  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly ingredientRows = computed(() => {
    const selected = this.values().ingredientes?.map((row) => row.producto_id) ?? [];
    return this.ingredients.controls.map((group, index) => ({
      group, index,
      options: this.materials().filter((item) => !selected.some((id, other) => other !== index && id === String(item.id)))
        .map((item) => ({ value: String(item.id), label: item.name, description: item.sku + (item.status === 'inactive' ? ' · Inactiva' : '') })),
    }));
  });
  readonly baseSummary = computed(() => {
    const grams = recipeGrams(this.values().rendimiento ?? '');
    return grams ? 'Base de ' + recipeKilograms(grams) : 'Rendimiento sin definir';
  });
  private actorId: number | string | null = null;
  private version = 0;
  private materialVersion = 0;
  private attempt: { body: CreateFeedRecipe; fingerprint: string; key: string } | null = null;
  private leavePromise: Promise<boolean> | null = null;

  constructor() {
    addIcons({ addOutline, arrowBackOutline, globeOutline, informationCircleOutline, trashOutline });
    effect(() => {
      const actor = this.auth.user()?.id ?? null;
      const allowed = this.canCreate();
      untracked(() => {
        this.version++;
        this.materialVersion++;
        this.actorId = actor;
        this.attempt = null;
        this.saving.set(false); this.uncertain.set(false); this.created.set(null); this.error.set(null);
        this.materials.set([]); this.materialsError.set(null); this.materialsLoading.set(false);
        while (this.ingredients.length > 1) this.ingredients.removeAt(this.ingredients.length - 1, { emitEvent: false });
        this.form.reset();
        if (actor !== null && allowed) void this.loadMaterials();
      });
    });
    const viewport = window.visualViewport;
    const updateViewport = () => this.viewportBottom.set(viewport && viewport.scale === 1
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0);
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    updateViewport();
    this.destroyRef.onDestroy(() => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
    });
  }

  async loadMaterials(): Promise<void> {
    if (!this.canCreate() || this.actorId === null) return;
    const version = ++this.materialVersion;
    this.materialsLoading.set(true); this.materialsError.set(null);
    try {
      const materials = await firstValueFrom(this.api.materials().pipe(takeUntilDestroyed(this.destroyRef)));
      if (version !== this.materialVersion || this.destroyRef.destroyed) return;
      this.materials.set(materials);
      for (const row of this.ingredients.controls) row.controls.producto_id.updateValueAndValidity({ emitEvent: false });
    } catch (error) {
      if (version !== this.materialVersion || this.destroyRef.destroyed) return;
      this.materialsError.set(error instanceof HttpErrorResponse && error.status === 403
        ? 'No tienes permiso para consultar las materias primas. Solicita acceso al catálogo de productos.'
        : recipeErrorMessage(error, 'No se pudieron cargar las materias primas. Intenta nuevamente.'));
    } finally {
      if (version === this.materialVersion && !this.destroyRef.destroyed) this.materialsLoading.set(false);
    }
  }

  addIngredient(): void {
    if (this.locked() || this.ingredients.length >= 1000) return;
    this.ingredients.push(this.newIngredient());
    this.form.markAsDirty();
  }

  removeIngredient(index: number): void {
    if (this.locked() || this.ingredients.length <= 1 || index < 0 || index >= this.ingredients.length) return;
    this.ingredients.removeAt(index); this.form.markAsDirty();
  }

  fieldError(control: AbstractControl): string | null {
    const server = control.getError('server');
    if (typeof server === 'string') return server;
    if (!control.touched) return null;
    if (control.hasError('required')) return 'Completa este campo.';
    if (control.hasError('maxlength')) return 'El valor supera el máximo permitido.';
    if (control.hasError('quantity')) return 'Ingresa una cantidad mayor que cero, con hasta 3 decimales y sin separadores de miles.';
    if (control.hasError('material')) return 'Selecciona una materia prima disponible en el catálogo.';
    if (control.hasError('duplicate')) return 'Cada materia prima puede aparecer una sola vez.';
    return null;
  }

  async submit(): Promise<void> {
    if (this.saving() || this.created() || !this.canCreate() || this.actorId === null || this.materialsLoading() || this.materialsError() || !this.materials().length) return;
    if (!this.uncertain()) {
      this.form.markAllAsTouched();
      if (this.form.invalid) { this.focusError(); return; }
      const value = this.form.getRawValue();
      const body: CreateFeedRecipe = {
        nombre: value.nombre.trim(), nota: value.nota.trim() || null, rendimiento_g: recipeGrams(value.rendimiento)!,
        ingredientes: value.ingredientes.map((row) => ({ producto_id: Number(row.producto_id), cantidad_g: recipeGrams(row.cantidad)! })),
      };
      const fingerprint = JSON.stringify({ ...body, ingredientes: [...body.ingredientes].sort((a, b) => a.producto_id - b.producto_id) });
      this.attempt = { body, fingerprint, key: this.attempt?.fingerprint === fingerprint ? this.attempt.key : crypto.randomUUID() };
    }
    const attempt = this.attempt;
    if (!attempt) return;
    const version = this.version;
    this.saving.set(true); this.error.set(null);
    try {
      const result = await firstValueFrom(this.api.create(attempt.body, attempt.key));
      if (version !== this.version || this.destroyRef.destroyed) return;
      this.created.set(result.data); this.uncertain.set(false);
      if (this.canRead()) await this.router.navigate([RECIPES_PATH, result.data.id], { queryParams: this.returnQuery, replaceUrl: true });
    } catch (error) {
      if (version !== this.version || this.destroyRef.destroyed) return;
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.uncertain.set(false); this.applyValidationErrors(error);
        this.error.set('Revisa los datos ingresados.');
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        this.uncertain.set(false);
        this.error.set('No se pudo crear la receta por un conflicto. Revisa las materias primas y vuelve a intentar.');
        void this.loadMaterials();
      } else if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500 || (error.status >= 200 && error.status < 300)) {
        this.uncertain.set(true);
        this.error.set('No pudimos confirmar la creación. Reintenta con los mismos datos para evitar duplicar la receta.');
      } else this.error.set(recipeErrorMessage(error, 'No se pudo crear la receta. Intenta nuevamente.'));
      this.focusError();
    } finally {
      if (version === this.version && !this.destroyRef.destroyed) this.saving.set(false);
    }
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.auth.user() || this.created()) return true;
    if (this.saving()) return false;
    if (!this.form.dirty && !this.uncertain()) return true;
    this.leavePromise ??= this.confirmLeave().finally(() => { this.leavePromise = null; });
    return this.leavePromise;
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.auth.user() && !this.created() && (this.form.dirty || this.saving())) {
      event.preventDefault(); event.returnValue = '';
    }
  }

  private newIngredient() {
    return new FormGroup({
      producto_id: new FormControl('', { nonNullable: true, validators: [Validators.required,
        (control) => !control.value || this.materials().some((item) => String(item.id) === control.value) ? null : { material: true }] }),
      cantidad: new FormControl('', { nonNullable: true, validators: [recipeQuantity] }),
    });
  }

  private async confirmLeave(): Promise<boolean> {
    const alert = await this.alerts.create({
      header: '¿Salir de la receta?',
      message: this.uncertain() ? 'La creación está pendiente de confirmación. Reintenta antes de salir para comprobar si se guardó.' : 'Los cambios sin guardar se perderán.',
      backdropDismiss: false,
      buttons: [{ text: 'Seguir editando', role: 'cancel' }, { text: 'Salir', role: 'discard' }],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'discard';
  }

  private applyValidationErrors(error: HttpErrorResponse): void {
    const problem = error.error as { errors?: Record<string, unknown> } | null;
    if (!problem || typeof problem !== 'object' || !problem.errors || typeof problem.errors !== 'object') return;
    for (const [field, messages] of Object.entries(problem.errors)) {
      if (!Array.isArray(messages)) continue;
      const message = messages.filter((item): item is string => typeof item === 'string').join(' ');
      const path = field.replace(/^rendimiento_g$/, 'rendimiento').replace(/^(ingredientes\.\d+)\.cantidad_g$/, '$1.cantidad');
      const control = this.form.get(path);
      if (control && message) control.setErrors({ ...control.errors, server: message });
    }
  }

  private focusError(): void {
    afterNextRender(() => {
      const target = this.formElement()?.nativeElement.querySelector<HTMLElement>('input.ng-invalid, textarea.ng-invalid, [aria-invalid="true"]')
        ?? this.formElement()?.nativeElement.querySelector<HTMLElement>('[role="alert"]');
      target?.focus(); target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, { injector: this.injector });
  }
}
