import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FlockFeedingOverview } from '../../interfaces/flock-feeding.interface';
import { Flock } from '../../interfaces/flock.interface';
import { FlockCollectionsService } from '../../services/flock-collections.service';
import { FlockDetailService } from '../../services/flock-detail.service';
import { FlockFeedingService } from '../../services/flock-feeding.service';
import { FlockDetailPage } from './flock-detail.page';

const flock = { id: 'lot-1', code: 'LOT-FEED-TEST', production_unit_id: 7, poultry_house_id: 3,
  status: 'active', entry_date: '2026-10-01', age_days: 14, current_quantity: 120 } as Flock;
const overview: FlockFeedingOverview = {
  current: { id: 10, lote_id: flock.id, modo: 'manual', receta_id: 1, cantidad_diaria_g: '20000',
    cantidad_manual_g: '20000', edad_dias: 15, fecha_vigencia: '2026-10-14',
    etapa: { recipe_id: 1, recipe_snapshot: { name: 'Pollitos bb 1' } }, finalizado: false },
  recipeName: 'Pollitos bb 1', scheduleAvailable: true, nextChange: { date: '2026-10-20', day: 20 },
};

describe('FlockDetailPage feeding overview', () => {
  const loadOverview = vi.fn<FlockFeedingService['overview']>();

  beforeEach(() => {
    loadOverview.mockReset().mockReturnValue(of(overview));
    TestBed.configureTestingModule({ imports: [FlockDetailPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: flock.id })) } },
      { provide: FlockDetailService, useValue: {
        flock: () => of(flock), mortalityTotal: () => of(0), latestWeighing: () => of(null),
      } },
      { provide: FlockFeedingService, useValue: { overview: loadOverview } },
      { provide: FlockCollectionsService, useValue: { summary: () => of(null) } },
      { provide: ProductionUnitsService, useValue: { getPoultryHouseById: () => of({ data: { name: 'Galpón 3' } }) } },
      { provide: AdminUnitContextService, useValue: { units: signal([{ id: 7, name: 'UP San José' }]) } },
    ] });
  });

  const setup = async () => {
    const fixture = TestBed.createComponent(FlockDetailPage);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance,
      card: fixture.nativeElement.querySelector('.feeding-card') as HTMLElement };
  };

  it('shows the configured ration, manual mode and forecast without promising an automatic change', async () => {
    const { card } = await setup();
    expect(loadOverview).toHaveBeenCalledWith(flock.id, 7);
    expect(card.textContent).toContain('Pollitos bb 1');
    expect(card.textContent).toContain('Manual');
    expect(card.textContent).toContain('20 oct. 2026 · Día 20');
    expect(card.textContent).toContain('requieren volver a automático');
    expect(card.querySelector('a')?.getAttribute('href')).toContain('/lot-1/alimentacion');
  });

  it('shows automatic mode and treats the future recipe availability as a forecast', async () => {
    loadOverview.mockReturnValue(of({ ...overview, current: { ...overview.current, modo: 'automatico' } }));
    const { card } = await setup();
    expect(card.textContent).toContain('Automático');
    expect(card.textContent).toContain('sujeto a disponibilidad');
    expect(card.textContent).not.toContain('requieren volver');
  });

  it.each([
    { value: { ...overview, nextChange: null }, expected: 'Sin próximos cambios previstos en el plan' },
    { value: { ...overview, scheduleAvailable: false, nextChange: null }, expected: 'Próximo cambio previsto: dato no disponible' },
    { value: { ...overview, current: { ...overview.current, finalizado: true } }, expected: 'Lote finalizado · sin próximos cambios' },
  ])('distinguishes missing schedules, exhausted plans and finalized flocks: $expected', async ({ value, expected }) => {
    loadOverview.mockReturnValue(of(value));
    const { card } = await setup();
    expect(card.textContent).toContain(expected);
  });

  it('keeps the rest of the detail usable when feeding cannot be loaded', async () => {
    loadOverview.mockReturnValue(throwError(() => new Error('Unavailable')));
    const { fixture, card } = await setup();
    expect(card.textContent).toContain('Alimentación no disponible');
    expect(fixture.nativeElement.textContent).toContain('LOT-FEED-TEST');
    expect(card.querySelector('a')).not.toBeNull();
  });

  it('clears the previous overview while reloading instead of retaining stale feeding details', async () => {
    const { fixture, page, card } = await setup();
    loadOverview.mockReturnValue(new Subject<FlockFeedingOverview>());
    page.load(); fixture.detectChanges();
    expect(page.feeding().state).toBe('loading');
    expect(card.textContent).not.toContain('Pollitos bb 1');
  });
});
