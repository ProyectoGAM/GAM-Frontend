import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { EggStockApi } from '../../services/egg-stock.api';
import { EggDonationsPage } from './egg-donations.page';

describe('Egg donations page', () => {
  let fixture: ComponentFixture<EggDonationsPage>;
  let units: Subject<{ data: { id: number; name: string }[]; meta: { current_page: number; last_page: number } }>;
  const api = { donationUnits: vi.fn(), movements: vi.fn(), donate: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    units = new Subject();
    api.donationUnits.mockReturnValue(units);
    api.movements.mockReturnValue(of({ data: [], meta: { current_page: 1, last_page: 1 } }));
    api.donate.mockReturnValue(of({ data: { transaction: 'donation-id' } }));
    await TestBed.configureTestingModule({
      imports: [EggDonationsPage],
      providers: [provideRouter([]), { provide: AuthStore, useValue: { isAdmin: () => true, user: () => ({ id: 1, permissions: [] }) } }, { provide: EggStockApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(EggDonationsPage);
    fixture.detectChanges();
    units.next({ data: [{ id: 2, name: 'Granja Santa Clara' }, { id: 3, name: 'Granja El Ombú' }], meta: { current_page: 1, last_page: 1 } });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows the active unit when options arrive and switches the history to the selected unit', async () => {
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#donation-unit')!;
    expect(select.value).toBe('2');
    expect(api.movements).toHaveBeenLastCalledWith(2, { type: 'donation', page: 1, per_page: 20 });
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(api.movements).toHaveBeenLastCalledWith(3, { type: 'donation', page: 1, per_page: 20 });
  });
});
