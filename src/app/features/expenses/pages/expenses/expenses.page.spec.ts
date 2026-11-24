import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AuthSession, AuthUser } from '../../../../core/auth/auth.types';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { maintenanceHouse, maintenanceUser } from '../../../production-units/testing/maintenance-fixtures';
import { Expense } from '../../interfaces/expense';
import { ExpensesService } from '../../services/expenses.service';
import { ExpensesPage } from './expenses.page';

describe('ExpensesPage', () => {
  const unit = maintenanceHouse.production_unit;
  const installationExpense: Expense = {
    id: 'installation:1', date: '2026-01-01', category: 'Mantenimiento de instalación',
    description: 'Limpieza de bebederos', origin: 'Galpón Norte', originLink: ['/galpon'], unit, amount: '10.10', currency: 'UYU',
  };
  const vehicleExpense: Expense = {
    id: 'fuel:1', date: '2026-01-02', category: 'Combustible',
    description: 'Gasoil', origin: 'ABC 1234', originLink: ['/vehiculos'], unit: null, amount: '20.20', currency: 'UYU',
  };

  function render(user: AuthUser, session: AuthSession | null = null, linkUnit?: number) {
    const list = vi.fn().mockReturnValue(of([installationExpense, vehicleExpense]));
    TestBed.configureTestingModule({ imports: [ExpensesPage], providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(linkUnit === undefined ? {} : { up_id: linkUnit })) } },
      { provide: AuthStore, useValue: { user: signal(user), session: signal(session), isAdmin: () => user.roles.includes('admin') } },
      { provide: AdminUnitContextService, useValue: { units: signal([unit]), state: signal('ready') } },
      { provide: ExpensesService, useValue: { list } },
    ] });
    const fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    return { fixture, list };
  }

  it('offers all expenses, one unit without vehicles and a global-only scope', () => {
    const { fixture, list } = render(maintenanceUser);
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(list).toHaveBeenLastCalledWith([unit], { fuel: true, maintenance: true });
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Gasoil');
    expect(fixture.nativeElement.querySelector('.totals').textContent).toContain('$30,3 UYU');

    select.value = String(unit.id);
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Limpieza de bebederos');
    expect(fixture.nativeElement.querySelector('tbody').textContent).not.toContain('Gasoil');
    expect(fixture.nativeElement.querySelector('.totals').textContent).toContain('$10,1 UYU');

    select.value = 'global';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Gasoil');
    expect(fixture.nativeElement.querySelector('tbody').textContent).not.toContain('Limpieza de bebederos');
    expect(list).toHaveBeenCalledOnce();
  });

  it('opens with the unit passed by the summary link', () => {
    const { fixture } = render(maintenanceUser, null, unit.id);
    expect(fixture.nativeElement.querySelector('select').value).toBe(String(unit.id));
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Limpieza de bebederos');
    expect(fixture.nativeElement.querySelector('tbody').textContent).not.toContain('Gasoil');
  });

  it('locks a PIN session to its unit and never requests vehicle expenses', () => {
    const { fixture, list } = render(maintenanceUser, {
      id: 'session', kind: 'shared_user', auth_method: 'pin', up_id: unit.id, expires_at: null, idle_timeout_seconds: null,
    }, 999);
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(list).toHaveBeenLastCalledWith([unit], { fuel: false, maintenance: false });
    expect(fixture.nativeElement.querySelector('tbody').textContent).not.toContain('Gasoil');
  });
});
