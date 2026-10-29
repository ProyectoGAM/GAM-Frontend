import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedRecipe } from '../../interfaces/feed-recipe';
import { FeedRecipesApi } from '../../services/feed-recipes.api';
import { RecipeDetailPage } from './recipe-detail.page';

const recipe: FeedRecipe = { id: 12, nombre: 'Ración BB', nota: 'Nota de prueba', rendimiento_g: '13000', estado: 'inactive',
  ingredientes: [{ producto_id: 1, nombre: 'Maíz', sku: 'MAIZ', cantidad_g: '2001' }], creado_en: '2026-10-26T12:00:00Z', actualizado_en: '2026-10-26T12:00:00Z' };

describe('RecipeDetailPage', () => {
  let harness: RouterTestingHarness; let page: RecipeDetailPage;
  const get = vi.fn(); const user = signal({ id: 1, roles: ['employee'], permissions: ['feed-recipes.view'] });
  beforeEach(() => { vi.resetAllMocks(); user.set({ id: 1, roles: ['employee'], permissions: ['feed-recipes.view'] }); get.mockReturnValue(of({ data: recipe })); });
  afterEach(() => harness.fixture.destroy());
  async function render(id = '12') {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'recetas/:id', component: RecipeDetailPage }]),
      { provide: AuthStore, useValue: { user, isAdmin: () => false } }, { provide: FeedRecipesApi, useValue: { get } }] });
    harness = await RouterTestingHarness.create(); page = await harness.navigateByUrl('/recetas/' + id + '?buscar=BB&estado=inactive&page=2', RecipeDetailPage);
    await settle();
  }
  async function settle() { await harness.fixture.whenStable(); harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges(); }

  it('reads inactive recipes and the actual composition with precise units and return context', async () => {
    await render(); const root = harness.routeNativeElement!;
    expect(root.textContent).toContain('Ración BB'); expect(root.textContent).toContain('Inactiva');
    expect(root.textContent).toContain('13 kg'); expect(root.textContent).toContain('2,001 kg');
    expect(root.textContent).toContain('Nota de prueba'); expect(root.textContent).toContain('MAIZ');
    expect(root.querySelector('.back')?.getAttribute('href')).toBe('/administracion/manejo-lotes/Recetas?buscar=BB&estado=inactive&page=2');
    expect(root.querySelector('form')).toBeNull(); expect(root.querySelector('input')).toBeNull();
  });

  it('shows not-found and network errors and retries only the requested recipe', async () => {
    get.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })));
    await render(); expect(page.state()).toBe('error'); expect(page.error()).toContain('No se encontró');
    await page.load(); await settle(); expect(get).toHaveBeenLastCalledWith('12'); expect(page.state()).toBe('success');
    get.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await page.load(); expect(page.error()).toContain('conectar');
  });

  it('does not query invalid IDs and does not mistake a manager grant for read access', async () => {
    await render('invalid'); expect(get).not.toHaveBeenCalled(); expect(page.state()).toBe('error');
    user.set({ id: 2, roles: ['employee'], permissions: ['feed-recipes.manage'] }); await settle();
    expect(page.state()).toBe('forbidden'); expect(page.recipe()).toBeNull();
  });

  it('ignores late results after changing the ID or clearing the current actor', async () => {
    const old = new Subject<{ data: FeedRecipe }>(); get.mockReturnValueOnce(old); await render();
    await TestBed.inject(Router).navigateByUrl('/recetas/13'); await settle();
    expect(get).toHaveBeenLastCalledWith('13'); old.next({ data: { ...recipe, nombre: 'Antigua' } }); await settle();
    expect(page.recipe()?.nombre).toBe('Ración BB');
    const pending = new Subject<{ data: FeedRecipe }>(); get.mockReturnValueOnce(pending); const loading = page.load();
    user.set({ id: 3, roles: ['employee'], permissions: [] }); await settle();
    pending.next({ data: recipe }); await loading; expect(page.recipe()).toBeNull();
  });
});
