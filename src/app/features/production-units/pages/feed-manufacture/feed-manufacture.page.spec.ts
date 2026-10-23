import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedManufacture, ManufactureCalculation } from '../../interfaces/feed-manufacture.interface';
import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { FeedManufactureService } from '../../services/feed-manufacture.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { FeedManufacturePage } from './feed-manufacture.page';

describe('FeedManufacturePage', () => {
  let fixture: ComponentFixture<FeedManufacturePage>;
  let service: { recipes: ReturnType<typeof vi.fn>; calculate: ReturnType<typeof vi.fn>; manufacture: ReturnType<typeof vi.fn>;
    readPending: ReturnType<typeof vi.fn>; rememberPending: ReturnType<typeof vi.fn>; forgetPending: ReturnType<typeof vi.fn> };
  let getPlant: ReturnType<typeof vi.fn>;
  const user = signal<{ id: number } | null>({ id: 1 });
  const plant: PoultryHouseDetail = { id: 10, name: 'Planta Norte', type: 'feed', status: 'operational', bird_capacity: null,
    production_unit_id: 1, production_unit: { id: 1, name: 'El Ombú', status: 'active', locality: null } };
  const recipe = { id: 12, nombre: 'Ración ponedoras', rendimiento_g: '13000', estado: 'active' };
  const calculation: ManufactureCalculation = { receta_id: 12, rendimiento_g: '13000', cantidad_g: '26000', factor: '2',
    ingredientes: [{ producto_id: 1, nombre: 'Maíz', cantidad_base_g: '2000', cantidad_requerida_g: '4000' }] };
  const result: FeedManufacture = { ...calculation, id: 124, operacion_id: 'uuid', nombre_receta: recipe.nombre, nombre_planta: plant.name,
    planta_id: 10, up_id: 1, registrado_en: '2026-10-22T12:00:00Z', saldo_anterior_g: '20000', saldo_resultante_g: '46000', estado: 'elaborada',
    distribucion: [{ producto_id: 1, planta_id: 10, nombre_planta: 'Planta Norte', cantidad_g: '250', linea_movimiento_id: 1 },
      { producto_id: 1, planta_id: 11, nombre_planta: 'Planta Sur', cantidad_g: '3750', linea_movimiento_id: 2 }] };

  beforeEach(() => {
    user.set({ id: 1 });
    getPlant = vi.fn().mockReturnValue(of({ data: plant }));
    service = { recipes: vi.fn().mockReturnValue(of([recipe])), calculate: vi.fn().mockReturnValue(of(calculation)),
      manufacture: vi.fn().mockReturnValue(of(result)), readPending: vi.fn().mockReturnValue(null), rememberPending: vi.fn(), forgetPending: vi.fn() };
    TestBed.configureTestingModule({ imports: [FeedManufacturePage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '1', houseId: '10' }) } } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: getPlant } },
      { provide: FeedManufactureService, useValue: service },
      { provide: AuthStore, useValue: { user, session: signal({ id: 'session-a' }) } },
    ] });
  });

  function render(): void { fixture = TestBed.createComponent(FeedManufacturePage); fixture.detectChanges(); }
  function review(): void {
    fixture.componentInstance.form.setValue({ recipeId: 12, kilograms: '26' });
    fixture.componentInstance.review();
    fixture.detectChanges();
  }

  it('reviews without changing stock, then registers and shows actual distribution with one return action', () => {
    render(); review();
    expect(service.calculate).toHaveBeenCalledWith(12, '26000');
    expect(service.manufacture).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('4 kg');
    expect(fixture.nativeElement.textContent).toContain('receta vigente');
    expect(fixture.nativeElement.textContent).not.toContain('Planta Sur');
    fixture.componentInstance.confirm(); fixture.detectChanges();
    expect(service.manufacture).toHaveBeenCalledWith({ receta_id: 12, planta_id: 10, cantidad_g: '26000' }, expect.any(String));
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Elaboración registrada');
    expect(fixture.nativeElement.textContent).toContain('46 kg');
    expect(fixture.nativeElement.textContent).toContain('0,25 kg');
    expect(fixture.nativeElement.textContent).toContain('Planta Sur');
    expect(fixture.nativeElement.querySelector('.result ion-button')?.getAttribute('href')).toBe('/administracion/unidades-productivas/1/galpon/10');
    expect(fixture.nativeElement.textContent).not.toContain('Ver detalle');
    fixture.componentInstance.confirm();
    expect(service.manufacture).toHaveBeenCalledOnce();
  });

  it('rejects nonmultiples, fractional grams and missing recipes before calling the calculation', () => {
    render();
    for (const kilograms of ['13.001', '0', '-13', '0.0001']) {
      fixture.componentInstance.form.setValue({ recipeId: 12, kilograms });
      fixture.componentInstance.review();
    }
    fixture.componentInstance.form.setValue({ recipeId: null, kilograms: '26' });
    fixture.componentInstance.review(); fixture.detectChanges();
    expect(service.calculate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Seleccioná una receta activa.');
  });

  it('blocks double confirmation while saving and reuses the exact request/key after an uncertain response', () => {
    const response = new Subject<FeedManufacture>();
    service.manufacture.mockReturnValueOnce(response).mockReturnValueOnce(of(result));
    render(); review();
    fixture.componentInstance.confirm();
    fixture.componentInstance.confirm();
    expect(service.manufacture).toHaveBeenCalledOnce();
    const first = service.manufacture.mock.calls[0];
    response.error(new HttpErrorResponse({ status: 0 })); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Consultar resultado');
    fixture.componentInstance.edit();
    expect(fixture.componentInstance.step()).toBe('review');
    fixture.componentInstance.confirm();
    expect(service.manufacture.mock.calls[1]).toEqual(first);
    expect(service.forgetPending).toHaveBeenCalledWith('1:session-a', 10);
  });

  it('restores an unresolved operation and recovers it without requiring the current recipe catalog', () => {
    const pending = { key: 'abbbbbbb-cccc-4ddd-8eee-ffffffffffff', request: { receta_id: 12, planta_id: 10, cantidad_g: '26000' } };
    service.readPending.mockReturnValue(pending);
    getPlant.mockReturnValue(of({ data: { ...plant, status: 'maintenance' } }));
    render();
    expect(fixture.componentInstance.step()).toBe('review');
    expect(service.recipes).not.toHaveBeenCalled();
    fixture.componentInstance.confirm();
    expect(service.manufacture).toHaveBeenCalledWith(pending.request, pending.key);
  });

  it('shows rejected stock conflicts and requires a new calculation before confirmation', () => {
    service.manufacture.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'El stock no alcanza para elaborar.' } })));
    render(); review(); fixture.componentInstance.confirm(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('El stock no alcanza');
    expect(fixture.componentInstance.result()).toBeNull();
    fixture.componentInstance.confirm();
    expect(service.manufacture).toHaveBeenCalledOnce();
    fixture.componentInstance.edit();
    expect(fixture.componentInstance.step()).toBe('configure');
  });

  it('blocks nonoperational plants and mismatched routes before loading recipes', () => {
    getPlant.mockReturnValue(of({ data: { ...plant, status: 'maintenance' } }));
    render();
    expect(fixture.nativeElement.textContent).toContain('La planta debe estar operativa');
    expect(service.recipes).not.toHaveBeenCalled();
    getPlant.mockReturnValue(of({ data: { ...plant, production_unit_id: 2 } }));
    fixture.componentInstance.load();
    expect(fixture.componentInstance.state()).toBe('notFound');
  });

  it('refreshes the catalog when a recipe changes before calculation', () => {
    service.recipes.mockReturnValueOnce(of([recipe])).mockReturnValueOnce(of([]));
    service.calculate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'La receta debe estar activa.' } })));
    render(); review();
    expect(service.recipes).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.selectedRecipe()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No hay recetas activas');
    expect(service.manufacture).not.toHaveBeenCalled();
  });

  it('shows empty and forbidden catalogs explicitly', () => {
    service.recipes.mockReturnValueOnce(of([])).mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    render();
    expect(fixture.nativeElement.textContent).toContain('No hay recetas activas');
    fixture.componentInstance.loadRecipes(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No tenés permiso');
  });

  it('clears the previous identity and ignores a late confirmation when the session changes', () => {
    const response = new Subject<FeedManufacture>();
    service.manufacture.mockReturnValue(response);
    render(); review(); fixture.componentInstance.confirm();
    user.set({ id: 2 }); fixture.detectChanges();
    response.next(result); fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.result()).toBeNull();
    expect(fixture.componentInstance.pending()).toBeNull();
  });
});
