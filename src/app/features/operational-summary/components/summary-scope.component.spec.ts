import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { AdminUnitContextService } from '../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { OperationalSummaryPage } from '../pages/operational-summary.page';
import { EggMetrics } from '../interfaces/operational-summary';
import { OperationalSummaryService } from '../services/operational-summary.service';
import { SummaryScopeComponent } from './summary-scope.component';

const firstPeriod = { from: '2026-11-01', to: '2026-11-07' };
const nextPeriod = { from: '2026-10-25', to: '2026-11-07' };
const metrics = (total: number): EggMetrics => ({
  total_eggs: total,
  daily_average: 0,
  by_day: [],
  comparacion: { desde: '2026-10-25', hasta: '2026-10-31', total_huevos: 0, variacion_porcentual: null },
});

describe('Operational summary scopes', () => {
  const user = signal({ permissions: ['can_view_egg_collections', 'can_view_flocks', 'can_view_notifications',
    'can_view_reports', 'can_view_delivery_history', 'can_view_mortality', 'can_view_poultry_houses'] });

  it('keeps independent results and refreshes the queries affected by each filter', async () => {
    const stale = new Subject<EggMetrics>();
    const api = {
      eggs: vi.fn((_period, unit: number | null) => of(metrics(unit === null ? 185 : 73))).mockReturnValueOnce(stale),
      eggPresentations: vi.fn().mockReturnValue(of([
        { id: 'huevo', label: 'Huevo', eggs_per_unit: 1 },
        { id: 'maple', label: 'Maple', eggs_per_unit: 30 },
        { id: 'docena', label: 'Docena', eggs_per_unit: 12 },
      ])),
      liveBirds: vi.fn().mockReturnValue(of({ aves_vivas: 240, consultado_en: '2026-11-07T14:00:00-03:00' })),
      mortality: vi.fn().mockReturnValue(throwError(() => new Error('Offline'))),
      alerts: vi.fn().mockReturnValue(of({ total: 3, por_urgencia: { alto: 1, medio: 2, bajo: 0 } })),
      expenses: vi.fn().mockReturnValue(of({ totales: [], fuentes_sin_permiso: ['combustible'] })),
      deliveredValue: vi.fn().mockReturnValue(of({ amount: null, deliveries: 1, unpriced: 1 })),
    };
    await TestBed.configureTestingModule({
      imports: [SummaryScopeComponent],
      providers: [{ provide: AuthStore, useValue: { user, isAdmin: () => true } },
        { provide: OperationalSummaryService, useValue: api }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SummaryScopeComponent);
    fixture.componentRef.setInput('period', firstPeriod);
    fixture.componentRef.setInput('company', true);
    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).textContent;
    };

    expect(await render()).toContain('Importe desconocido');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudo cargar este indicador');
    expect(stale.observed).toBe(true);

    fixture.componentRef.setInput('period', nextPeriod);
    expect(await render()).toContain('185');
    const toggle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.equivalence-toggle')!;
    expect(toggle.textContent).toContain('6 × Maple + 5 huevos sueltos');
    toggle.click();
    await render();
    expect(toggle.textContent).toContain('15 × Docena + 5 huevos sueltos');
    toggle.click();
    await render();
    expect(toggle.textContent).toContain('185 × Huevo');
    toggle.click();
    await render();
    expect(toggle.textContent).toContain('6 × Maple + 5 huevos sueltos');
    expect(stale.observed).toBe(false);
    expect(api.eggs).toHaveBeenLastCalledWith(nextPeriod, null);
    expect(api.deliveredValue).toHaveBeenCalledTimes(2);
    expect(api.liveBirds).toHaveBeenCalledTimes(1);
    expect(api.alerts).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('company', false);
    fixture.componentRef.setInput('unit', 12);
    expect(await render()).not.toContain('Valor entregado');
    expect(api.eggs).toHaveBeenLastCalledWith(nextPeriod, 12);
    expect(api.alerts).toHaveBeenLastCalledWith(12);
    expect(api.expenses).toHaveBeenLastCalledWith(nextPeriod, 12);
    expect((fixture.nativeElement as HTMLElement).querySelector('.equivalence-toggle')?.textContent)
      .toContain('2 × Maple + 13 huevos sueltos');
    expect(api.eggPresentations).toHaveBeenCalledTimes(1);
    expect(api.deliveredValue).toHaveBeenCalledTimes(2);
  });

  it('starts at Global and reuses the single summary when an UP is chosen', async () => {
    const birds = vi.fn((unit: number | null) => of({
      aves_vivas: unit === null ? 320 : 120, consultado_en: '2026-11-07T14:00:00-03:00',
    }));
    const alertCounts = vi.fn().mockReturnValue(of({ total: 3, por_urgencia: { alto: 1, medio: 2, bajo: 0 } }));
    const emptyPage = of({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
    await TestBed.configureTestingModule({
      imports: [OperationalSummaryPage],
      providers: [
        { provide: AuthStore, useValue: {
          user: () => ({ permissions: ['can_view_flocks', 'can_view_notifications'] }),
          isAdmin: () => false, status: () => 'personal_authenticated',
        } },
        { provide: AdminUnitContextService, useValue: {
          units: signal([{ id: 12, name: 'UP San José' }]), state: signal('ready'), selectedId: signal(12),
        } },
        { provide: ProductionUnitsService, useValue: { poultryHouses: () => of([]) } },
        { provide: OperationalSummaryService, useValue: {
          liveBirds: birds, alerts: alertCounts, flocks: () => emptyPage, feedBalances: () => emptyPage,
        } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(OperationalSummaryPage);
    const host = fixture.nativeElement as HTMLElement;
    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    await render();
    const selector = host.querySelector<HTMLSelectElement>('#summary-unit')!;
    const summary = host.querySelector('app-summary-scope');
    expect(selector.selectedOptions[0].textContent).toBe('Global');
    expect(birds).toHaveBeenLastCalledWith(null);
    expect(alertCounts).toHaveBeenLastCalledWith(null);
    expect(host.querySelector('app-summary-unit-operations')).toBeNull();

    selector.value = '12';
    selector.dispatchEvent(new Event('change'));
    await render();
    expect(host.querySelectorAll('app-summary-scope')).toHaveLength(1);
    expect(host.querySelector('app-summary-scope')).toBe(summary);
    expect(birds).toHaveBeenLastCalledWith(12);
    expect(alertCounts).toHaveBeenLastCalledWith(12);
    expect(host.querySelector('app-summary-unit-operations')).not.toBeNull();
    expect(host.querySelectorAll('a')).toHaveLength(0);

    selector.value = '';
    selector.dispatchEvent(new Event('change'));
    await render();
    expect(host.querySelector('app-summary-scope')).toBe(summary);
    expect(birds).toHaveBeenLastCalledWith(null);
    expect(host.querySelector('app-summary-unit-operations')).toBeNull();
  });
});
