import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { Customer, Paginated } from '../../interfaces/customer';
import { CustomersApi } from '../../services/customers.api';
import { CustomerListPage } from './customer-list.page';

describe('CustomerListPage search', () => {
  const list = vi.fn<CustomersApi['list']>();
  const emptyPage: Paginated<Customer> = {
    data: [], meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    list.mockReset().mockReturnValue(of(emptyPage));
    TestBed.configureTestingModule({
      imports: [CustomerListPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ page: '2' }) } } },
        { provide: AuthStore, useValue: { user: () => ({ roles: ['admin'], permissions: [] }) } },
        { provide: CustomersApi, useValue: { list } },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  it('queries while typing, ignores outdated results, and clears the term on the first page', async () => {
    const previous = new Subject<Paginated<Customer>>();
    list.mockReturnValueOnce(previous);
    const fixture = TestBed.createComponent(CustomerListPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const field = fixture.nativeElement.querySelector('input[type=search]') as HTMLInputElement;
    const type = (value: string) => {
      field.value = value;
      field.dispatchEvent(new Event('input'));
    };
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }), 2);
    type('Go');
    await vi.advanceTimersByTimeAsync(200);
    type('Golondrinas');
    previous.next({ ...emptyPage, meta: { ...emptyPage.meta, total: 25, current_page: 2 } });
    await vi.advanceTimersByTimeAsync(299);
    expect(list).toHaveBeenCalledTimes(1);
    expect(page.meta()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Golondrinas', status: 'active' }), 1);
    expect(page.meta()?.current_page).toBe(1);
    type('');
    await vi.advanceTimersByTimeAsync(300);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined, status: 'active' }), 1);
  });
});
