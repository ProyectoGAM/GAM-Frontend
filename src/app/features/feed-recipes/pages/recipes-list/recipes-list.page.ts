import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, chevronForwardOutline, funnelOutline, globeOutline, searchOutline } from 'ionicons/icons';
import { debounceTime, firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { hasFeedRecipesPermission } from '../../../../core/auth/access-policy';
import { FilterDialogComponent } from '../../../../shared/ui/filter-dialog/filter-dialog.component';
import { FeedRecipe, RecipeFilters, RecipePage } from '../../interfaces/feed-recipe';
import { FeedRecipesApi } from '../../services/feed-recipes.api';
import { ingredientPreview, recipeErrorMessage, recipeFilters, recipeKilograms, recipeQuery } from '../../services/recipe-presentation';
import { RecipeLoadState, RecipeStatus } from '../../types/recipe-status.type';

@Component({
  selector: 'app-recipes-list',
  imports: [ReactiveFormsModule, RouterLink, IonIcon, FilterDialogComponent],
  templateUrl: './recipes-list.page.html',
  styleUrl: './recipes-list.page.scss',
})
export class RecipesListPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(FeedRecipesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly canRead = computed(() => this.auth.isAdmin() || hasFeedRecipesPermission(this.auth.user(), 'view'));
  readonly canCreate = computed(() => this.auth.isAdmin() || hasFeedRecipesPermission(this.auth.user(), 'manage'));
  readonly search = new FormControl('', { nonNullable: true });
  readonly searchForm = new FormGroup({ buscar: this.search });
  readonly draftStatus = new FormControl<RecipeStatus | ''>('', { nonNullable: true });
  readonly applied = signal<RecipeFilters>(recipeFilters(this.route.snapshot.queryParamMap));
  readonly filterCount = computed(() => Number(Boolean(this.applied().estado)));
  readonly hasCriteria = computed(() => !!this.applied().buscar || !!this.applied().estado);
  readonly state = signal<RecipeLoadState>('idle');
  readonly error = signal<string | null>(null);
  readonly recipes = signal<FeedRecipe[]>([]);
  readonly meta = signal<RecipePage['meta'] | null>(null);
  readonly rows = computed(() => this.recipes().map((recipe) => ({
    recipe, yield: recipeKilograms(recipe.rendimiento_g), count: recipe.ingredientes.length,
    preview: ingredientPreview(recipe.ingredientes),
  })));
  readonly returnQuery = computed(() => recipeQuery(this.applied()));
  @ViewChild(FilterDialogComponent, { static: true }) private readonly filterDialog!: FilterDialogComponent;
  private loadVersion = 0;

  constructor() {
    addIcons({ addOutline, chevronForwardOutline, funnelOutline, globeOutline, searchOutline });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.filterDialog?.close();
      const filters = recipeFilters(params);
      this.search.setValue(filters.buscar, { emitEvent: false });
      this.applied.set(filters);
    });
    this.search.valueChanges.pipe(debounceTime(250), takeUntilDestroyed()).subscribe(() => void this.searchRecipes());
    effect(() => {
      const actor = this.auth.user()?.id;
      const filters = this.applied();
      const canRead = this.canRead();
      untracked(() => {
        if (!actor || !canRead) {
          this.loadVersion++;
          this.filterDialog?.close();
          this.recipes.set([]);
          this.meta.set(null);
          this.error.set(null);
          this.state.set('forbidden');
        } else void this.load(filters);
      });
    });
  }

  async load(filters = this.applied()): Promise<void> {
    if (!this.canRead()) return;
    const version = ++this.loadVersion;
    this.state.set('loading');
    this.recipes.set([]);
    this.meta.set(null);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.list(filters));
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.recipes.set(response.data);
      this.meta.set(response.meta);
      this.state.set(response.data.length ? 'success' : 'empty');
    } catch (error) {
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.state.set(error instanceof HttpErrorResponse && error.status === 403 ? 'forbidden' : 'error');
      this.error.set(recipeErrorMessage(error, 'No se pudieron cargar las recetas. Intenta nuevamente.'));
    }
  }

  async searchRecipes(): Promise<void> {
    const buscar = this.search.value.trim().slice(0, 120);
    if (buscar === this.applied().buscar) return;
    await this.navigate({ ...this.applied(), buscar, page: 1 });
  }

  async openFilters(trigger: HTMLElement): Promise<void> {
    await this.searchRecipes();
    if (this.destroyRef.destroyed) return;
    this.draftStatus.setValue(this.applied().estado);
    this.filterDialog.open(trigger);
  }

  async applyFilters(): Promise<void> {
    this.filterDialog.close();
    await this.navigate({ ...this.applied(), estado: this.draftStatus.value, page: 1 });
  }

  clearDraft(): void { this.draftStatus.setValue(''); }

  async clearCriteria(): Promise<void> {
    this.search.setValue('', { emitEvent: false });
    await this.navigate({ buscar: '', estado: '', page: 1 });
  }

  async changePage(page: number): Promise<void> {
    if (!this.meta() || page < 1 || page > this.meta()!.last_page || this.state() === 'loading') return;
    await this.navigate({ ...this.applied(), page });
  }

  private navigate(filters: RecipeFilters): Promise<boolean> {
    return this.router.navigate([], { relativeTo: this.route, queryParams: recipeQuery(filters), replaceUrl: true });
  }
}
