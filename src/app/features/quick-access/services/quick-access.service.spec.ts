import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { Flock } from '../../flocks/interfaces/flock.interface';
import { FlocksApi } from '../../flocks/services/flocks.api';
import { PoultryHouse, ProductionUnit } from '../../production-units/interfaces/production-unit.interface';
import { ProductionUnitsService } from '../../production-units/services/production-units.service';
import { QuickAccessService } from './quick-access.service';

const unit: ProductionUnit = { id: 7, name: 'San José', status: 'active', locality: null };
const house: PoultryHouse = { id: 22, name: 'Galpón 2', type: 'poultry', status: 'operational', bird_capacity: 1000 };
const flock = { id: 'lot-1', code: 'L-01', production_unit_id: 7, poultry_house_id: 22, status: 'active' } as Flock;

describe('QuickAccessService', () => {
  const poultryHouses = vi.fn(); const list = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks(); poultryHouses.mockReturnValue(of([house])); list.mockReturnValue(of([flock]));
    TestBed.configureTestingModule({ providers: [
      { provide: ProductionUnitsService, useValue: { poultryHouses } },
      { provide: FlocksApi, useValue: { list } },
    ] });
  });

  it('joins each operational house to its current lot within the same UP and prepares accent-insensitive search', async () => {
    const rows = await firstValueFrom(TestBed.inject(QuickAccessService).houses([unit]));
    expect(poultryHouses).toHaveBeenCalledWith(7, 'poultry');
    expect(list).toHaveBeenCalledWith({ production_unit_id: 7 });
    expect(rows[0]).toMatchObject({ house, unit, flock, unavailableReason: null, searchText: 'galpon 2 san jose l-01' });
  });

  it('does not offer finished lots, other-UP lots, inactive houses, feed plants or inactive units', async () => {
    poultryHouses.mockReturnValue(of([house, { ...house, id: 23, status: 'inactive' }, { ...house, id: 24, type: 'feed' }]));
    list.mockReturnValue(of([{ ...flock, status: 'finished' }, { ...flock, id: 'foreign', production_unit_id: 8 }]));
    const rows = await firstValueFrom(TestBed.inject(QuickAccessService).houses([unit, { ...unit, id: 8, status: 'inactive' }]));
    expect(rows).toHaveLength(1); expect(rows[0].flock).toBeNull(); expect(rows[0].unavailableReason).toBe('Sin lote activo');
    expect(list).toHaveBeenCalledOnce();
  });

  it('blocks ambiguous housing and houses under maintenance, and keeps quarantined lots available', async () => {
    poultryHouses.mockReturnValue(of([house, { ...house, id: 23, status: 'maintenance' }, { ...house, id: 24 }]));
    list.mockReturnValue(of([flock, { ...flock, id: 'lot-2' }, { ...flock, id: 'lot-3', poultry_house_id: 24, status: 'quarantined' }]));
    const rows = await firstValueFrom(TestBed.inject(QuickAccessService).houses([unit]));
    expect(rows.find((row) => row.house.id === 22)?.unavailableReason).toContain('más de un lote');
    expect(rows.find((row) => row.house.id === 23)?.unavailableReason).toContain('fuera de operación');
    expect(rows.find((row) => row.house.id === 24)?.flock?.status).toBe('quarantined');
  });

  it('returns an empty selection without requests and fails rather than showing incomplete all-UP results', async () => {
    expect(await firstValueFrom(TestBed.inject(QuickAccessService).houses([]))).toEqual([]);
    expect(list).not.toHaveBeenCalled();
    poultryHouses.mockImplementation((id: number) => id === 7 ? of([house]) : throwError(() => new Error('Unavailable')));
    await expect(firstValueFrom(TestBed.inject(QuickAccessService).houses([unit, { ...unit, id: 8 }]))).rejects.toThrow('Unavailable');
  });

  it('lists active feed plants by unit without requiring lot access and marks nonoperational plants', async () => {
    poultryHouses.mockReturnValue(of([
      { ...house, id: 30, name: 'Planta 10', type: 'feed' },
      { ...house, id: 31, name: 'Planta 2', type: 'feed', status: 'maintenance' },
      { ...house, id: 32, type: 'feed', status: 'inactive' }, house,
    ]));
    const rows = await firstValueFrom(TestBed.inject(QuickAccessService).plants([unit, { ...unit, id: 8, status: 'inactive' }]));
    expect(poultryHouses).toHaveBeenCalledExactlyOnceWith(7, 'feed');
    expect(list).not.toHaveBeenCalled();
    expect(rows.map((item) => item.plant.id)).toEqual([31, 30]);
    expect(rows[0].unavailableReason).toContain('operativa');
    expect(rows[1]).toMatchObject({ unit, unavailableReason: null, searchText: 'planta 10 san jose' });
  });

  it('returns no plants for an empty selection and does not silently omit a unit on failure', async () => {
    expect(await firstValueFrom(TestBed.inject(QuickAccessService).plants([]))).toEqual([]);
    expect(poultryHouses).not.toHaveBeenCalled();
    poultryHouses.mockImplementation((id: number) => id === 7 ? of([]) : throwError(() => new Error('Unavailable')));
    await expect(firstValueFrom(TestBed.inject(QuickAccessService).plants([unit, { ...unit, id: 8 }]))).rejects.toThrow('Unavailable');
  });
});
