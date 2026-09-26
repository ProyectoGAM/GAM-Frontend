import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { PoultryHouseDetail, ProductionUnit } from '../../interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../services/production-units.service';
import { PoultryHouseFormPage } from './poultry-house-form.page';

describe('PoultryHouseFormPage', () => {
  const unit: ProductionUnit = {
    id: 7,
    name: 'Granja Norte',
    status: 'active',
    locality: { id: 8, department_id: 9, name: 'Pando', department: { id: 9, name: 'Canelones' } },
  };
  const house: PoultryHouseDetail = {
    id: 22,
    production_unit_id: 7,
    production_unit: unit,
    name: 'Galpón Norte',
    type: 'poultry',
    status: 'operational',
    bird_capacity: 1000,
    current_occupancy: 100,
  };
  let fixture: ComponentFixture<PoultryHouseFormPage>;
  let listAll: ReturnType<typeof vi.fn>;
  let getPoultryHouseById: ReturnType<typeof vi.fn>;
  let createPoultryHouse: ReturnType<typeof vi.fn>;
  let updatePoultryHouse: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  function render(params: Record<string, string> = {}, query: Record<string, string> = {}): PoultryHouseFormPage {
    listAll = vi.fn().mockReturnValue(of([unit]));
    getPoultryHouseById = vi.fn().mockReturnValue(of({ data: house }));
    createPoultryHouse = vi.fn().mockReturnValue(of({ data: house }));
    updatePoultryHouse = vi.fn().mockReturnValue(of({ data: house }));
    TestBed.configureTestingModule({
      imports: [PoultryHouseFormPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params), queryParamMap: convertToParamMap(query) } } },
        { provide: ProductionUnitsService, useValue: { listAll, getPoultryHouseById, createPoultryHouse, updatePoultryHouse } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PoultryHouseFormPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('creates a poultry house in an active unit with capacity and operational initial state', () => {
    const page = render({}, { unitId: '7' });
    page.form.controls.name.setValue('  Galpón Nuevo  ');
    page.form.controls.capacity.setValue('12000');
    page.submit();

    expect(createPoultryHouse).toHaveBeenCalledWith(7, { name: 'Galpón Nuevo', type: 'poultry', bird_capacity: 12000 });
    expect(navigate).toHaveBeenCalledWith(['/administracion/ubicaciones/unidades-productivas', 7, 'galpon', 22]);
    expect(fixture.nativeElement.textContent).toContain('Se creará como Operativo');
  });

  it('creates a feed plant without sending bird capacity, even after entering a poultry capacity', () => {
    const page = render();
    page.onUnitChanged(7);
    page.form.controls.capacity.setValue('8000');
    page.setType('feed');
    page.form.controls.name.setValue('Planta Norte');
    page.submit();

    expect(createPoultryHouse).toHaveBeenCalledWith(7, { name: 'Planta Norte', type: 'feed' });
    expect(createPoultryHouse.mock.calls[0][1]).not.toHaveProperty('bird_capacity');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[formControlName="capacity"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Crear planta de ración');
  });

  it('maps backend validation errors to the fields', () => {
    const page = render({}, { unitId: '7' });
    createPoultryHouse.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { name: ['El nombre ya está registrado.'], bird_capacity: ['La capacidad debe ser mayor que cero.'] } },
    })));
    page.form.controls.name.setValue('Galpón Repetido');
    page.form.controls.capacity.setValue('100');
    page.submit();
    fixture.detectChanges();

    expect(page.fieldErrors()).toEqual({ name: 'El nombre ya está registrado.', capacity: 'La capacidad debe ser mayor que cero.' });
    expect(fixture.nativeElement.textContent).toContain('El nombre ya está registrado.');
  });

  it('refreshes active units after a creation conflict', () => {
    const page = render({}, { unitId: '7' });
    createPoultryHouse.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'La unidad está inactiva.' } })));
    listAll.mockReturnValueOnce(of([{ ...unit, status: 'inactive' }]));
    page.form.controls.name.setValue('Galpón Nuevo');
    page.form.controls.capacity.setValue('100');
    page.submit();

    expect(listAll).toHaveBeenCalledTimes(2);
    expect(page.state()).toBe('empty');
    expect(page.message()).toContain('La unidad está inactiva.');
  });

  it('edits a feed plant name without type, capacity, unit or status', () => {
    const page = render({ id: '7', houseId: '22' });
    const feed = { ...house, type: 'feed' as const, name: 'Planta Norte', bird_capacity: null, current_occupancy: null };
    getPoultryHouseById.mockReturnValue(of({ data: feed }));
    page.retry();
    page.form.controls.name.setValue('Planta Sur');
    page.submit();

    expect(updatePoultryHouse).toHaveBeenCalledWith(22, { name: 'Planta Sur' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('El tipo no se puede modificar');
    expect(fixture.nativeElement.querySelector('[formControlName="capacity"]')).toBeNull();
  });

  it('does not submit unchanged data and refreshes poultry capacity after a conflict', () => {
    const page = render({ id: '7', houseId: '22' });
    page.submit();
    expect(updatePoultryHouse).not.toHaveBeenCalled();
    expect(page.message()).toBe('No hay cambios para guardar.');

    updatePoultryHouse.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Capacidad inferior a la ocupación.' } })));
    getPoultryHouseById.mockReturnValueOnce(of({ data: { ...house, bird_capacity: 1200, current_occupancy: 1100 } }));
    page.form.controls.capacity.setValue('900');
    page.submit();

    expect(updatePoultryHouse).toHaveBeenCalledWith(22, { bird_capacity: 900 });
    expect(getPoultryHouseById).toHaveBeenCalledTimes(2);
    expect(page.form.controls.capacity.value).toBe('1200');
    expect(page.message()).toContain('Capacidad inferior a la ocupación.');
  });
});
