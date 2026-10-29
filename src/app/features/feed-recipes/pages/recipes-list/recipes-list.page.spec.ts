import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { feedRecipesRoutes } from '../../feed-recipes.routes';
import { FeedRecipe, RecipeFilters, RecipePage } from '../../interfaces/feed-recipe';
import { FeedRecipesApi } from '../../services/feed-recipes.api';
import { RecipesListPage } from './recipes-list.page';

const recipe = (id: number, estado: 'active' | 'inactive' = 'active'): FeedRecipe => ({
  id, nombre: 'Ración BB', nota: null, rendimiento_g: '13001', estado,
  ingredientes: [{ producto_id: 1, nombre: 'Maíz', sku: 'MAIZ', cantidad_g: '2000' }, { producto_id: 2, nombre: 'Soja', sku: 'SOJA', cantidad_g: '5000' }],
  creado_en: '2026-10-26T12:00:00Z', actualizado_en: '2026-10-26T12:00:00Z',
});
const response = (page = 1, data = [recipe(24), recipe(23, 'inactive')], total = 60, lastPage = 3): RecipePage => ({
  data, links: { first: null, last: null, prev: null, next: null }, meta: { current_page: page, last_page: lastPage, per_page: 25, total },
});
const base = '/administracion/manejo-lotes/Recetas';

describe('RecipesListPage', () => {
  let harness: RouterTestingHarness;
  let page: RecipesListPage;
  let restore: () => void;
  const list = vi.fn(); const get = vi.fn();
  const user = signal({ id: 1, roles: ['employee'], permissions: ['feed-recipes.view', 'feed-recipes.manage'] });
  beforeEach(() => {
    restore = stubNativeDialog(); vi.resetAllMocks();
    user.set({ id: 1, roles: ['employee'], permissions: ['feed-recipes.view', 'feed-recipes.manage'] });
    list.mockImplementation((filters: RecipeFilters) => of(response(filters.page)));
    get.mockReturnValue(of({ data: recipe(24) }));
  });
  afterEach(() => { harness?.fixture.destroy(); restore(); });
  async function render(query = '') {
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'administracion/manejo-lotes/Recetas', children: feedRecipesRoutes }]),
      { provide: AuthStore, useValue: { user, isAdmin: () => user().roles.includes('admin') } },
      { provide: FeedRecipesApi, useValue: { list, get } },
    ] });
    harness = await RouterTestingHarness.create(); page = await harness.navigateByUrl(base + query, RecipesListPage);
    await settle();
  }
  async function settle() {
    await harness.fixture.whenStable(); harness.detectChanges();
    await harness.fixture.whenStable(); harness.detectChanges();
  }
  const root = () => harness.routeNativeElement!;
  async function filters() { (root().querySelector('.filter-trigger') as HTMLButtonElement).click(); await settle(); return root().querySelector('.filters-dialog') as HTMLDialogElement; }

  it('lists active and inactive global recipes using stable IDs and the server total', async () => {
    await render('?up_id=5');
    expect(list).toHaveBeenCalledExactlyOnceWith({ buscar: '', estado: '', page: 1 });
    expect(root().querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root().textContent).toContain('ID 24'); expect(root().textContent).toContain('ID 23');
    expect(root().textContent).toContain('13,001 kg'); expect(root().textContent).toContain('60 recetas encontradas');
    expect(root().querySelector('.status.inactive')?.textContent).toBe('Inactiva');
    expect(root().querySelector('select')).toBeNull();
    expect(root().querySelector('.detail-cell a')?.getAttribute('href')).toBe(base + '/24');
  });

  it('uses search/status/page URL context and preserves it when opening and leaving a recipe', async () => {
    await render('?buscar=BB&estado=inactive&page=2');
    expect(list).toHaveBeenLastCalledWith({ buscar: 'BB', estado: 'inactive', page: 2 });
    const href = root().querySelector('.detail-cell a')!.getAttribute('href')!;
    expect(href).toBe(base + '/24?buscar=BB&estado=inactive&page=2');
    await harness.navigateByUrl(href); await settle();
    expect(get).toHaveBeenCalledWith('24');
    const back = root().querySelector('.back')!.getAttribute('href')!;
    expect(back).toBe(base + '?buscar=BB&estado=inactive&page=2');
    page = await harness.navigateByUrl(back, RecipesListPage); await settle();
    expect(page.applied()).toEqual({ buscar: 'BB', estado: 'inactive', page: 2 });
    expect(page.search.value).toBe('BB');
  });

  it('searches on typing and Enter without dropping the applied status or sending duplicate queries', async () => {
    await render('?estado=inactive&page=2');
    page.search.setValue('  Recría  ');
    await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith({ buscar: 'Recría', estado: 'inactive', page: 1 }));
    await settle(); const calls = list.mock.calls.length;
    await page.searchRecipes(); await settle(); expect(list).toHaveBeenCalledTimes(calls);
    const input = root().querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'BB'; input.dispatchEvent(new Event('input'));
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    root().querySelector('form')!.dispatchEvent(submit); await settle();
    expect(submit.defaultPrevented).toBe(true);
    expect(TestBed.inject(Router).url).toContain('buscar=BB');
    expect(page.applied().estado).toBe('inactive');
    await new Promise((resolve) => setTimeout(resolve, 300)); await settle();
    expect(list).toHaveBeenCalledTimes(calls + 1);
  });

  it('flushes a pending search before opening filters so its timer cannot close the dialog', async () => {
    await render(); page.search.setValue('BB');
    const modal = await filters(); expect(modal.open).toBe(true);
    expect(page.applied().buscar).toBe('BB');
    await new Promise((resolve) => setTimeout(resolve, 300)); await settle();
    expect(modal.open).toBe(true); expect(list).toHaveBeenCalledTimes(2);
  });

  it('applies and clears only the status draft and cancels edits without changing the query', async () => {
    await render('?buscar=BB'); let modal = await filters();
    page.draftStatus.setValue('inactive');
    expect(list).toHaveBeenCalledTimes(1); expect(page.filterCount()).toBe(0);
    modal.dispatchEvent(new Event('cancel', { cancelable: true })); await settle();
    expect(document.activeElement).toBe(root().querySelector('.filter-trigger'));
    modal = await filters(); expect(page.draftStatus.value).toBe('');
    page.draftStatus.setValue('inactive'); await page.applyFilters(); await settle();
    expect(modal.open).toBe(false); expect(page.filterCount()).toBe(1);
    expect(list).toHaveBeenLastCalledWith({ buscar: 'BB', estado: 'inactive', page: 1 });
    await filters(); page.clearDraft();
    expect(page.applied().estado).toBe('inactive');
    modal.dispatchEvent(new Event('cancel', { cancelable: true }));
    await page.changePage(2); await settle();
    expect(list).toHaveBeenLastCalledWith({ buscar: 'BB', estado: 'inactive', page: 2 });
  });

  it('paginates and retries with the applied filters after a failed read', async () => {
    await render('?buscar=BB&estado=active');
    list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await page.changePage(2); await settle();
    expect(page.state()).toBe('error'); expect(root().textContent).toContain('conectar');
    expect(root().querySelector('tbody')).toBeNull();
    await page.load(); await settle();
    expect(list).toHaveBeenLastCalledWith({ buscar: 'BB', estado: 'active', page: 2 });
    expect(page.state()).toBe('success');
    await page.changePage(0); expect(page.applied().page).toBe(2);
  });

  it('distinguishes an empty catalogue from no matches and clears search and status together', async () => {
    list.mockReturnValue(of(response(1, [], 0, 1))); await render('?buscar=nada&estado=inactive');
    expect(root().textContent).toContain('No hay recetas que coincidan');
    await page.clearCriteria(); await settle();
    expect(page.applied()).toEqual({ buscar: '', estado: '', page: 1 });
    expect(root().textContent).toContain('Aún no hay recetas.');
  });

  it('handles a stale deep-linked page without claiming the catalogue is empty', async () => {
    list.mockImplementation((filters: RecipeFilters) => of(filters.page === 99 ? response(99, [], 2, 1) : response(1)));
    await render('?page=99');
    expect(root().textContent).toContain('No hay recetas en esta página');
    await page.changePage(1); await settle(); expect(page.state()).toBe('success');
  });

  it('ignores older search results and errors after a newer query succeeds', async () => {
    const old = new Subject<RecipePage>(); list.mockReturnValueOnce(old); await render();
    page.search.setValue('Nueva'); await page.searchRecipes(); await settle();
    expect(page.state()).toBe('success');
    old.error(new HttpErrorResponse({ status: 500 })); await settle();
    expect(page.error()).toBeNull(); expect(page.state()).toBe('success');
    expect(page.applied().buscar).toBe('Nueva');
  });

  it('does not expose the new-recipe action to a reader, and never treats manage as view', async () => {
    user.set({ id: 1, roles: ['employee'], permissions: ['feed-recipes.view'] }); await render();
    expect(root().querySelector('.page-heading a')).toBeNull();
    user.set({ id: 2, roles: ['employee'], permissions: ['feed-recipes.manage'] }); await settle();
    expect(page.state()).toBe('forbidden'); expect(page.recipes()).toEqual([]);
    expect(root().querySelector('.page-heading a')?.getAttribute('href')).toBe(base + '/nueva');
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('allows ADMIN without explicit grants and displays server-side denial safely', async () => {
    user.set({ id: 1, roles: ['admin'], permissions: [] });
    list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    await render(); expect(page.state()).toBe('forbidden');
    expect(root().textContent).toContain('No tienes permiso'); expect(page.canCreate()).toBe(true);
  });

  it('clears the old identity and ignores pending results after logout and destruction', async () => {
    await render(); const pending = new Subject<RecipePage>(); list.mockReturnValueOnce(pending);
    const request = page.load(); user.set({ id: 2, roles: ['employee'], permissions: [] }); await settle();
    pending.next(response()); await request; expect(page.recipes()).toEqual([]); expect(page.state()).toBe('forbidden');
    user.set({ id: 3, roles: ['employee'], permissions: ['feed-recipes.view'] }); await settle();
    const late = new Subject<RecipePage>(); list.mockReturnValueOnce(late); const destroyedRequest = page.load();
    harness.fixture.destroy(); late.next(response()); await destroyedRequest; expect(page.recipes()).toEqual([]);
  });

  it('bounds unsupported URL parameters before making an API request', async () => {
    await render('?estado=draft&page=-5&buscar=' + 'a'.repeat(150) + '&stock_location_id=8');
    expect(list).toHaveBeenLastCalledWith({ buscar: 'a'.repeat(120), estado: '', page: 1 });
  });
});
