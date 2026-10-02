import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PoultryHouseListItem } from '../../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { Flock } from '../../interfaces/flock.interface';
import { FlocksApi } from '../../services/flocks.api';
import { FlocksListPage } from './flocks-list.page';

describe('FlocksListPage', () => {
  let fixture: ComponentFixture<FlocksListPage>;
  let listFlocks: ReturnType<typeof vi.fn>;
  let listAllPoultryHouses: ReturnType<typeof vi.fn>;
  let selectedUnitId: WritableSignal<number | null>;
  let selectUnit: ReturnType<typeof vi.fn>;

  const flock: Flock = {
    id: '01J00000000000000000000000',
    code: 'Ponedoras A-24',
    breed_id: 1,
    supplier_id: null,
    supplier_name: null,
    origin: null,
    poultry_house_id: 22,
    production_unit_id: 7,
    initial_quantity: 1000,
    current_quantity: 1000,
    entry_date: '2026-01-01',
    established_at: '2026-01-01T12:00:00+00:00',
    age_days: 0,
    current_week: 1,
    is_grouped: false,
    status: 'active',
    version: 1,
    notes: null,
    finalized_at: null,
    finalization_reason: null,
  };

  const house: PoultryHouseListItem = {
    id: 22,
    name: 'Galpón Norte 1',
    type: 'poultry',
    status: 'operational',
    bird_capacity: 1000,
    productionUnit: {
      id: 7,
      name: 'Granja Norte',
      status: 'active',
      locality: {
        id: 3,
        department_id: 2,
        name: 'Pando',
        department: { id: 2, name: 'Canelones' },
      },
    },
  };

  beforeEach(() => {
    listFlocks = vi.fn(() => of([flock]));
    listAllPoultryHouses = vi.fn(() => of([house]));
    selectedUnitId = signal<number | null>(7);
    selectUnit = vi.fn((id: number | null) => selectedUnitId.set(id));

    TestBed.configureTestingModule({
      imports: [FlocksListPage],
      providers: [
        provideRouter([]),
        { provide: FlocksApi, useValue: { list: listFlocks } },
        { provide: ProductionUnitsService, useValue: { listAllPoultryHouses } },
        { provide: AuthStore, useValue: { isAdmin: signal(true) } },
        {
          provide: AdminUnitContextService,
          useValue: {
            state: signal('ready'),
            selectedId: selectedUnitId,
            selectedUnit: computed(() => selectedUnitId() === 7 ? house.productionUnit : null),
            units: signal([house.productionUnit]),
            select: selectUnit,
            load: vi.fn(),
          },
        },
      ],
    });
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(FlocksListPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows flock code, resolved house and entry date with the global UP chip', async () => {
    await render();

    const card = fixture.nativeElement.querySelector('.flock-card') as HTMLElement;
    expect(card.textContent).toContain('Ponedoras A-24');
    expect(card.querySelector('.house-name')?.textContent).toContain('Galpón Norte 1');
    expect(card.querySelector('.entry-date')?.textContent).toContain('01-01-2026');
    expect(fixture.nativeElement.querySelector('.filter-chip')?.textContent).toContain('Granja Norte');
    expect(fixture.nativeElement.querySelector('.filter-count')?.textContent).toContain('1');
    expect(fixture.nativeElement.querySelector('#admin-unit-select')).toBeNull();
    expect(listFlocks).toHaveBeenCalledWith({ production_unit_id: 7 });
  });

  it('shows the hen badge only for a grouped flock', async () => {
    listFlocks.mockReturnValue(of([
      { ...flock, id: 'grouped', is_grouped: true },
      { ...flock, id: 'individual', code: 'Recría B-07', is_grouped: false },
    ]));
    await render();

    const cards = fixture.nativeElement.querySelectorAll('.flock-card') as NodeListOf<HTMLElement>;
    expect(cards[0].querySelector('.grouped-badge')?.textContent).toContain('Agrupado');
    expect(cards[0].querySelector('.grouped-badge svg')).not.toBeNull();
    expect(cards[1].querySelector('.grouped-badge')).toBeNull();
  });

  it('refreshes the API list when the global UP changes, and omits it for all units', async () => {
    await render();

    selectedUnitId.set(12);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(listFlocks).toHaveBeenLastCalledWith({ production_unit_id: 12 });

    selectedUnitId.set(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(listFlocks).toHaveBeenLastCalledWith({});
  });

  it('applies the sheet selection through the global UP context', async () => {
    await render();

    fixture.componentInstance.draftUnitId.set(null);
    fixture.componentInstance.applyFilters();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(selectUnit).toHaveBeenCalledWith(null);
    expect(listFlocks).toHaveBeenLastCalledWith({});
    expect(fixture.nativeElement.querySelector('.filter-chip')).toBeNull();
  });
});
