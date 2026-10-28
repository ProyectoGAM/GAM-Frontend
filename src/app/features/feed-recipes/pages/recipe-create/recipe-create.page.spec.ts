import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AlertController } from '@ionic/angular';
import { Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { feedRecipesRoutes } from '../../feed-recipes.routes';
import { RecipeMaterial } from '../../interfaces/create-feed-recipe';
import { FeedRecipe } from '../../interfaces/feed-recipe';
import { FeedRecipesApi } from '../../services/feed-recipes.api';
import { RecipeCreatePage } from './recipe-create.page';

const base = '/administracion/manejo-lotes/Recetas';
const materials: RecipeMaterial[] = [
  { id: 1, name: 'Maíz', sku: 'MAIZ-025', kind: 'raw_material', base_unit: 'g', stock_tracked: true, status: 'active' },
  { id: 2, name: 'Soja', sku: 'SOJA-025', kind: 'raw_material', base_unit: 'g', stock_tracked: true, status: 'inactive' },
];
const recipe: FeedRecipe = { id: 7, nombre: 'Postura', nota: null, rendimiento_g: '100000', estado: 'active', ingredientes: [], creado_en: '2026-10-27T12:00:00Z', actualizado_en: '2026-10-27T12:00:00Z' };

describe('RecipeCreatePage', () => {
  let harness: RouterTestingHarness;
  let page: RecipeCreatePage;
  const user = signal({ id: 1, permissions: ['feed-recipes.manage', 'feed-recipes.view'], roles: ['employee'] });
  const api = { materials: vi.fn(), create: vi.fn(), get: vi.fn(), list: vi.fn() };
  const dismissed = vi.fn();
  const alertCreate = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks(); user.set({ id: 1, permissions: ['feed-recipes.manage', 'feed-recipes.view'], roles: ['employee'] });
    api.materials.mockReturnValue(of(materials)); api.create.mockReturnValue(of({ data: recipe })); api.get.mockReturnValue(of({ data: recipe }));
    dismissed.mockResolvedValue({ role: 'cancel' }); alertCreate.mockResolvedValue({ present: vi.fn().mockResolvedValue(undefined), onDidDismiss: dismissed });
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'administracion/manejo-lotes/Recetas', children: feedRecipesRoutes }]),
      { provide: AuthStore, useValue: { user, isAdmin: () => user().roles.includes('admin') } },
      { provide: FeedRecipesApi, useValue: api }, { provide: AlertController, useValue: { create: alertCreate } },
    ] });
  });
  afterEach(() => harness?.fixture.destroy());
  async function render(query = '') {
    harness = await RouterTestingHarness.create(); page = await harness.navigateByUrl(base + '/nueva' + query, RecipeCreatePage); await settle();
  }
  async function settle() { await harness.fixture.whenStable(); harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges(); }
  const root = () => harness.routeNativeElement!;
  function fill(selector: string, value: string) {
    const input = root().querySelector<HTMLInputElement>(selector)!;
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function valid() {
    fill('#recipe-name', '  Postura  '); fill('#recipe-yield', '100');
    page.ingredients.at(0).setValue({ producto_id: '1', cantidad: '60,001' }); page.form.markAsDirty();
  }

  it('loads global materials, allows inactive ingredients and prevents duplicate choices', async () => {
    await render('?buscar=BB&estado=inactive&page=2');
    expect(api.materials).toHaveBeenCalledTimes(1); expect(root().querySelector('select')).toBeNull();
    expect(root().querySelector('.back')?.getAttribute('href')).toBe(base + '?buscar=BB&estado=inactive&page=2');
    expect(page.ingredientRows()[0].options[1].description).toContain('Inactiva');
    page.ingredients.at(0).controls.producto_id.setValue('1'); page.addIngredient(); await settle();
    expect(page.ingredientRows()[1].options.map((item) => item.value)).toEqual(['2']);
    page.ingredients.at(1).controls.producto_id.setValue('1'); await settle();
    expect(page.ingredients.hasError('duplicate')).toBe(true);
    page.removeIngredient(0); page.removeIngredient(0); expect(page.ingredients.length).toBe(1);
    expect(page.ingredientRows()[0].options).toHaveLength(2);
  });

  it('validates a real form submit before writing and links errors to their inputs', async () => {
    await render(); const event = new Event('submit', { bubbles: true, cancelable: true });
    root().querySelector('form')!.dispatchEvent(event); await settle();
    expect(event.defaultPrevented).toBe(true); expect(api.create).not.toHaveBeenCalled();
    expect(root().querySelector('#recipe-name')?.getAttribute('aria-invalid')).toBe('true');
    expect(root().querySelector('#recipe-yield-error')?.textContent).toContain('Completa');
    expect(root().querySelector('#recipe-material-error-0')?.textContent).toContain('Completa');
    fill('#recipe-yield', '1,0001'); await settle();
    expect(root().querySelector('#recipe-yield-error')?.textContent).toContain('3 decimales');
    valid(); page.ingredients.at(0).controls.producto_id.setValue('999'); await page.submit(); expect(api.create).not.toHaveBeenCalled();
  });

  it('creates exact gram strings with independent yield and returns to detail with list context', async () => {
    await render('?buscar=BB&page=2'); valid(); page.addIngredient();
    page.ingredients.at(1).setValue({ producto_id: '2', cantidad: '0.001' });
    await page.submit(); await settle();
    const [body, key] = api.create.mock.calls[0];
    expect(body).toEqual({ nombre: 'Postura', nota: null, rendimiento_g: '100000', ingredientes: [{ producto_id: 1, cantidad_g: '60001' }, { producto_id: 2, cantidad_g: '1' }] });
    expect(key).toMatch(/^[0-9a-f-]{36}$/); expect(body).not.toHaveProperty('up_id');
    expect(TestBed.inject(Router).url).toBe(base + '/7?buscar=BB&page=2');
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('blocks duplicate clicks and edits while saving and permits navigation after success', async () => {
    const pending = new Subject<{ data: FeedRecipe }>(); api.create.mockReturnValue(pending);
    await render(); valid(); const request = page.submit(); await settle();
    await page.submit(); page.addIngredient(); page.removeIngredient(0);
    expect(api.create).toHaveBeenCalledTimes(1); expect(page.ingredients.length).toBe(1);
    expect(root().querySelector('fieldset')?.disabled).toBe(true); expect(page.canLeave()).toBe(false);
    pending.next({ data: recipe }); await request; expect(page.canLeave()).toBe(true);
  });

  it('retries an uncertain result with the exact same body/key and locks editable fields', async () => {
    await render(); valid(); api.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await page.submit(); await settle(); const [body, key] = api.create.mock.calls[0];
    expect(page.uncertain()).toBe(true); expect(root().querySelector('fieldset')?.disabled).toBe(true);
    expect(root().textContent).toContain('Reintentar creación');
    await page.submit(); expect(api.create).toHaveBeenLastCalledWith(body, key);
  });

  it('preserves input after 422, attaches ingredient errors and uses a new key for corrected content', async () => {
    user.set({ id: 1, permissions: ['feed-recipes.manage'], roles: ['employee'] });
    await render(); valid(); api.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { 'ingredientes.0.cantidad_g': ['Cantidad no válida.'], rendimiento_g: ['Rendimiento inválido.'] } } })));
    await page.submit(); await settle(); const oldKey = api.create.mock.calls[0][1];
    expect(page.form.controls.nombre.value).toBe('  Postura  '); expect(page.locked()).toBe(false);
    expect(root().querySelector('#recipe-quantity-error-0')?.textContent).toBe('Cantidad no válida.');
    page.form.controls.rendimiento.setValue('20'); page.ingredients.at(0).controls.cantidad.setValue('15');
    await page.submit(); await settle();
    expect(api.create.mock.calls[1][1]).not.toBe(oldKey);
    expect(page.created()?.id).toBe(7); expect(root().textContent).toContain('Receta creada');
    expect(root().textContent).not.toContain('Ver receta');
  });

  it('handles catalogue failure, retry, empty catalogue and missing catalogue permission without writing', async () => {
    api.materials.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    await render(); expect(root().textContent).toContain('Solicita acceso al catálogo');
    valid(); await page.submit(); expect(api.create).not.toHaveBeenCalled();
    api.materials.mockReturnValueOnce(of([])); await page.loadMaterials(); await settle();
    expect(root().textContent).toContain('No hay materias primas compatibles'); await page.submit(); expect(api.create).not.toHaveBeenCalled();
    await page.loadMaterials(); await settle(); expect(page.materials()).toHaveLength(2);
  });

  it('lets the user cancel or confirm leaving a dirty form and guards browser reload', async () => {
    await render(); expect(page.canLeave()).toBe(true); fill('#recipe-name', 'Borrador');
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    page.beforeUnload(event); expect(event.defaultPrevented).toBe(true);
    expect(await page.canLeave()).toBe(false); expect(page.form.controls.nombre.value).toBe('Borrador');
    dismissed.mockResolvedValueOnce({ role: 'discard' }); expect(await page.canLeave()).toBe(true);
    expect(alertCreate).toHaveBeenCalledTimes(2);
  });

  it('clears the previous actor data and ignores late save/material results', async () => {
    await render(); valid(); const pending = new Subject<{ data: FeedRecipe }>(); api.create.mockReturnValue(pending);
    const request = page.submit(); user.set({ id: 2, permissions: [], roles: ['employee'] }); await settle();
    pending.next({ data: recipe }); await request; await settle();
    expect(page.created()).toBeNull(); expect(page.materials()).toEqual([]); expect(page.form.controls.nombre.value).toBe('');
    expect(root().textContent).toContain('No tienes permiso para crear');
    const materialsRequest = new Subject<RecipeMaterial[]>(); api.materials.mockReturnValue(materialsRequest);
    user.set({ id: 3, permissions: ['feed-recipes.manage'], roles: ['employee'] }); await settle();
    harness.fixture.destroy(); materialsRequest.next(materials); materialsRequest.complete();
    expect(page.materials()).toEqual([]);
  });

  it('unlocks a rejected conflict and refreshes material eligibility without silently changing keys', async () => {
    await render(); valid(); api.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    api.materials.mockReturnValueOnce(of(materials.slice(1))); await page.submit(); await settle();
    expect(page.uncertain()).toBe(false); expect(page.ingredients.at(0).controls.producto_id.hasError('material')).toBe(true);
    expect(root().textContent).toContain('conflicto'); expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('keeps semantic retry identity after reordering and maps validation indices to the submitted order', async () => {
    await render(); valid(); page.addIngredient();
    page.ingredients.at(1).setValue({ producto_id: '2', cantidad: '40' });
    await settle();
    api.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422 })));
    await page.submit(); const key = api.create.mock.calls[0][1];
    page.removeIngredient(0); page.addIngredient();
    page.ingredients.at(1).setValue({ producto_id: '1', cantidad: '60.001' });
    await settle();
    api.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { 'ingredientes.0.cantidad_g': ['Revisa la cantidad de soja.'] } } })));
    await page.submit(); await settle();
    expect(api.create.mock.calls[1][0].ingredientes.map((row: { producto_id: number }) => row.producto_id)).toEqual([2, 1]);
    expect(api.create.mock.calls[1][1]).toBe(key);
    expect(root().querySelector('#recipe-quantity-error-0')?.textContent).toContain('soja');
  });
});
