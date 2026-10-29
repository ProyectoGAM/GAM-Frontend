import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { hasFeedRecipesPermission } from '../../../../core/auth/access-policy';
import { FeedRecipe } from '../../interfaces/feed-recipe';
import { FeedRecipesApi } from '../../services/feed-recipes.api';
import { recipeErrorMessage, recipeFilters, recipeKilograms, recipeQuery } from '../../services/recipe-presentation';
import { RecipeLoadState } from '../../types/recipe-status.type';

@Component({
  selector: 'app-recipe-detail',
  imports: [RouterLink, IonIcon, DatePipe],
  templateUrl: './recipe-detail.page.html',
  styleUrl: './recipe-detail.page.scss',
})
export class RecipeDetailPage {
  private readonly api = inject(FeedRecipesApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly id = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly returnQuery = signal(recipeQuery(recipeFilters(this.route.snapshot.queryParamMap)));
  readonly recipe = signal<FeedRecipe | null>(null);
  readonly state = signal<RecipeLoadState>('idle');
  readonly error = signal<string | null>(null);
  readonly yieldLabel = computed(() => this.recipe() ? recipeKilograms(this.recipe()!.rendimiento_g) : '');
  readonly ingredients = computed(() => this.recipe()?.ingredientes.map((item) => ({ ...item, quantity: recipeKilograms(item.cantidad_g) })) ?? []);
  private loadVersion = 0;

  constructor() {
    addIcons({ arrowBackOutline });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.id.set(params.get('id') ?? ''));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.returnQuery.set(recipeQuery(recipeFilters(params))));
    effect(() => {
      const actor = this.auth.user()?.id;
      const id = this.id();
      const canRead = this.auth.isAdmin() || hasFeedRecipesPermission(this.auth.user(), 'view');
      untracked(() => {
        this.loadVersion++;
        this.recipe.set(null);
        this.error.set(null);
        if (!actor || !canRead) this.state.set('forbidden');
        else void this.load(id);
      });
    });
  }

  async load(id = this.id()): Promise<void> {
    if (!this.auth.isAdmin() && !hasFeedRecipesPermission(this.auth.user(), 'view')) return;
    const version = ++this.loadVersion;
    if (!/^[1-9]\d*$/.test(id)) { this.error.set('No se encontró la receta solicitada.'); this.state.set('error'); return; }
    this.state.set('loading');
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.get(id));
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.recipe.set(response.data);
      this.state.set('success');
    } catch (error) {
      if (version !== this.loadVersion || this.destroyRef.destroyed) return;
      this.state.set(error instanceof HttpErrorResponse && error.status === 403 ? 'forbidden' : 'error');
      this.error.set(recipeErrorMessage(error, 'No se pudo cargar la receta. Intenta nuevamente.'));
    }
  }
}
