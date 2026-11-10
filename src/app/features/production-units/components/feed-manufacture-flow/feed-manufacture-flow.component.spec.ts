import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthStore } from '../../../../core/auth/auth.store';
import { FeedManufacture, ManufactureCalculation } from '../../interfaces/feed-manufacture.interface';
import { PoultryHouseDetail } from '../../interfaces/production-unit.interface';
import { FeedManufactureService } from '../../services/feed-manufacture.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { FeedManufactureFlowComponent } from './feed-manufacture-flow.component';

describe('FeedManufactureFlowComponent', () => {
  let fixture: ComponentFixture<FeedManufactureFlowComponent>;
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
    TestBed.configureTestingModule({ imports: [FeedManufactureFlowComponent], providers: [provideRouter([]),
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: getPlant } },
      { provide: FeedManufactureService, useValue: service },
      { provide: AuthStore, useValue: { user, session: signal({ id: 'session-a' }) } },
    ] });
  });

  function render(embedded = false): void {
    fixture = TestBed.createComponent(FeedManufactureFlowComponent);
    fixture.componentRef.setInput('unitId', 1); fixture.componentRef.setInput('plantId', 10); fixture.componentRef.setInput('embedded', embedded);
    fixture.detectChanges();
  }
  function review(): void {
    fixture.componentInstance.form.setValue({ recipeId: 12, multiplier: '2' });
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

  it('rejects invalid multipliers, excessive totals and missing recipes before calling the calculation', () => {
    render();
    for (const multiplier of ['', '0', '-2', '1.5', '1,5', '1e3', '76923077']) {
      fixture.componentInstance.form.setValue({ recipeId: 12, multiplier });
      fixture.componentInstance.review();
    }
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reducí el multiplicador.');
    fixture.componentInstance.form.setValue({ recipeId: null, multiplier: '2' });
    fixture.componentInstance.review(); fixture.detectChanges();
    expect(service.calculate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Seleccioná una receta activa.');
  });

  it('starts with one base and presents a calculated total without an editable quantity', () => {
    render();
    fixture.componentInstance.form.controls.recipeId.setValue(12); fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.multiplier.value).toBe('1');
    const slider = fixture.nativeElement.querySelector('ion-range') as HTMLIonRangeElement;
    expect(slider.min).toBe(1);
    expect(slider.max).toBe(10);
    expect(slider.step).toBe(1);
    expect(slider.value).toBe(1);
    expect(fixture.nativeElement.querySelector('ion-input[formControlName="kilograms"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('output')?.textContent).toContain('13 kg × 1 = 13 kg');
    fixture.componentInstance.form.controls.multiplier.setValue('2'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('output')?.textContent).toContain('13 kg × 2 = 26 kg');
    fixture.componentInstance.review(); fixture.detectChanges();
    expect(service.calculate).toHaveBeenCalledWith(12, '26000');
    expect(fixture.nativeElement.querySelector('.review-basis')?.textContent).toContain('13 kg × 2 = 26 kg');
    expect(service.manufacture).not.toHaveBeenCalled();
  });

  it('keeps the slider locked until a recipe is selected and locks it again when the selection is cleared', () => {
    render();
    const page = fixture.componentInstance;
    const slider = fixture.nativeElement.querySelector('ion-range') as HTMLIonRangeElement;
    expect(slider.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Seleccioná una ración para habilitar el deslizador');
    slider.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 10 } }));
    expect(page.form.controls.multiplier.value).toBe('1');
    page.form.controls.recipeId.setValue(12); fixture.detectChanges();
    expect(slider.disabled).toBe(false);
    slider.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 4 } }));
    expect(page.form.controls.multiplier.value).toBe('4');
    page.form.controls.recipeId.setValue(null); fixture.detectChanges();
    expect(slider.disabled).toBe(true);
    slider.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 10 } }));
    expect(page.form.controls.multiplier.value).toBe('4');
    expect(service.calculate).not.toHaveBeenCalled();
  });

  it('uses the slider endpoints to update the manual factor and total before requesting a review', () => {
    render();
    const page = fixture.componentInstance;
    page.form.controls.recipeId.setValue(12); fixture.detectChanges();
    const slider = fixture.nativeElement.querySelector('ion-range') as HTMLIonRangeElement;
    for (const factor of [10, 1, 5, 10]) {
      slider.dispatchEvent(new CustomEvent('ionChange', { detail: { value: factor } })); fixture.detectChanges();
      expect(page.form.controls.multiplier.value).toBe(String(factor));
      expect(fixture.nativeElement.querySelector('output')?.textContent).toContain(`13 kg × ${factor} = ${13 * factor} kg`);
    }
    expect(service.calculate).not.toHaveBeenCalled();
    expect(service.manufacture).not.toHaveBeenCalled();
    page.review();
    expect(service.calculate).toHaveBeenCalledWith(12, '130000');
  });

  it('synchronizes manual factors and preserves values above ten when the slider display or recipe changes', async () => {
    service.recipes.mockReturnValue(of([recipe, { ...recipe, id: 13, nombre: 'Otra ración', rendimiento_g: '25000' }]));
    render(); await fixture.whenStable();
    const page = fixture.componentInstance;
    page.form.controls.recipeId.setValue(12); fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('ion-input[formControlName="multiplier"]') as HTMLIonInputElement;
    const slider = fixture.nativeElement.querySelector('ion-range') as HTMLIonRangeElement;
    for (const factor of ['4', '25']) {
      input.value = factor;
      input.dispatchEvent(new CustomEvent('ionInput', { detail: { value: factor }, bubbles: true }));
      await fixture.whenStable(); fixture.detectChanges();
      expect(page.form.controls.multiplier.value).toBe(factor);
      expect(slider.value).toBe(Math.min(10, Number(factor)));
    }
    // Ionic emits ionInput for programmatic range updates; only user commits change the form.
    slider.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 10 } })); fixture.detectChanges();
    expect(page.form.controls.multiplier.value).toBe('25');
    expect(fixture.nativeElement.querySelector('output')?.textContent).toContain('13 kg × 25 = 325 kg');
    page.form.controls.recipeId.setValue(13); fixture.detectChanges();
    expect(page.form.controls.multiplier.value).toBe('25');
    expect(fixture.nativeElement.querySelector('output')?.textContent).toContain('25 kg × 25 = 625 kg');
    page.review();
    expect(service.calculate).toHaveBeenCalledWith(13, '625000');
  });

  it('locks the slider with the form while a calculation is pending', () => {
    const pendingCalculation = new Subject<ManufactureCalculation>(); service.calculate.mockReturnValue(pendingCalculation);
    render(); review();
    const page = fixture.componentInstance;
    const slider = fixture.nativeElement.querySelector('ion-range') as HTMLIonRangeElement;
    expect(slider.disabled).toBe(true);
    slider.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 10 } }));
    expect(page.form.controls.multiplier.value).toBe('2');
    pendingCalculation.error(new HttpErrorResponse({ status: 0 })); fixture.detectChanges();
    expect(slider.disabled).toBe(false);
    expect(page.form.controls.multiplier.enabled).toBe(true);
  });

  it('recalculates from the selected recipe base and invalidates an old review after editing', () => {
    service.recipes.mockReturnValue(of([recipe, { ...recipe, id: 13, nombre: 'Otra ración', rendimiento_g: '25000' }]));
    render(); review();
    fixture.componentInstance.edit();
    fixture.componentInstance.form.controls.recipeId.setValue(13); fixture.detectChanges();
    expect(fixture.componentInstance.calculation()).toBeNull();
    expect(fixture.nativeElement.querySelector('output')?.textContent).toContain('25 kg × 2 = 50 kg');
    fixture.componentInstance.review();
    expect(service.calculate).toHaveBeenLastCalledWith(13, '50000');
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

  it('reviews and confirms from the modal footer and closes with the actual registered quantity', () => {
    render(true); const closed = vi.fn(); fixture.componentInstance.closed.subscribe(closed);
    expect(fixture.nativeElement.querySelector('.back-link')).toBeNull();
    expect(fixture.nativeElement.querySelector('.recipe-label select')).not.toBeNull();
    fixture.componentInstance.form.setValue({ recipeId: 12, multiplier: '2' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.quantity-preview')?.textContent).toContain('26 kg');
    fixture.nativeElement.querySelector('.flow-footer .primary').click(); fixture.detectChanges();
    expect(service.calculate).toHaveBeenCalledWith(12, '26000');
    expect(service.manufacture).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.flow-footer .primary').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.flow-footer').textContent).toContain('Listo');
    expect(fixture.nativeElement.textContent).toContain('46 kg');
    expect(closed).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.flow-footer .primary').click();
    expect(closed).toHaveBeenCalledExactlyOnceWith('Elaboración registrada: 26 kg de Ración ponedoras.');
  });

  it('focuses the modal heading again after replacing the initial loading state', async () => {
    const response = new Subject<{ data: PoultryHouseDetail }>(); getPlant.mockReturnValue(response);
    render(true); response.next({ data: plant }); response.complete();
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1'));
  });

  it('blocks modal closure while calculating or saving and preserves an uncertain operation on close and reopen', () => {
    const calculationResponse = new Subject<ManufactureCalculation>();
    const saveResponse = new Subject<FeedManufacture>();
    service.calculate.mockReturnValue(calculationResponse); service.manufacture.mockReturnValueOnce(saveResponse).mockReturnValueOnce(of(result));
    render(true); const closed = vi.fn(); fixture.componentInstance.closed.subscribe(closed);
    review(); expect(fixture.componentInstance.canLeave()).toBe(false);
    fixture.componentInstance.close(); expect(closed).not.toHaveBeenCalled();
    calculationResponse.next(calculation); calculationResponse.complete(); fixture.detectChanges();
    expect(fixture.componentInstance.canLeave()).toBe(true);
    fixture.componentInstance.confirm(); fixture.detectChanges();
    expect(fixture.componentInstance.canLeave()).toBe(false);
    fixture.componentInstance.close(); expect(closed).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.close-flow').disabled).toBe(true);
    const original = service.manufacture.mock.calls[0];
    saveResponse.error(new HttpErrorResponse({ status: 0 })); fixture.detectChanges();
    expect(fixture.componentInstance.canLeave()).toBe(true);
    fixture.componentInstance.close(); expect(closed).toHaveBeenCalledWith(null);
    expect(service.forgetPending).not.toHaveBeenCalled();
    service.readPending.mockReturnValue(service.rememberPending.mock.calls[0][1]);
    fixture.destroy(); render(true);
    expect(fixture.componentInstance.step()).toBe('review');
    fixture.componentInstance.confirm();
    expect(service.manufacture.mock.calls[1]).toEqual(original);
  });
});
