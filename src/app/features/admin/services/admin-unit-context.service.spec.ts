import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { ProductionUnit } from '../../production-units/interfaces/production-unit.interface';
import { AdminUnitContextService } from './admin-unit-context.service';

const units: ProductionUnit[] = [
  { id: 3, name: 'La Esperanza', status: 'active', locality: { id: 1, name: 'Centro', department_id: 1, department: { id: 1, name: 'Canelones' } } },
  { id: 7, name: 'El Ombú', status: 'active', locality: { id: 1, name: 'Centro', department_id: 1, department: { id: 1, name: 'Canelones' } } },
];

describe('AdminUnitContextService', () => {
  const isAdmin = signal(true);
  let context: AdminUnitContextService;

  beforeEach(() => {
    isAdmin.set(true);
    TestBed.configureTestingModule({
      providers: [
        AdminUnitContextService,
        { provide: AuthStore, useValue: { isAdmin } },
        { provide: ProductionUnitsService, useValue: { listAll: () => of(units) } },
      ],
    });
    context = TestBed.inject(AdminUnitContextService);
  });

  it('starts administrators on all UP and only accepts listed UP', async () => {
    await context.load();
    expect(context.selectedId()).toBeNull();
    context.select(7);
    expect(context.selectedUnit()?.name).toBe('El Ombú');
    context.select(999);
    expect(context.selectedId()).toBe(7);
    context.select(null);
    expect(context.selectedId()).toBeNull();
  });

  it('selects an available UP for users without the all-UP option', async () => {
    isAdmin.set(false);
    await context.load();
    expect(context.selectedId()).toBe(3);
    context.select(null);
    expect(context.selectedId()).toBe(3);
  });
});
