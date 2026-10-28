import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { HealthCatalogsApi } from '../../services/health-catalogs.api';
import { healthPage, medicineItem, vaccineItem } from '../../testing/health-catalog-fixtures';
import { CatalogRecord, HealthPage } from '../../interfaces/health-catalog';
import { HealthCatalogKind } from '../../types/health-catalog.type';
import { CatalogListPage } from './catalog-list.page';

describe('Health catalog listings', () => {
  let fixture: ComponentFixture<CatalogListPage>;
  let restore: () => void;
  const admin = signal(true); const user = signal({ id: 1 });
  const params = new BehaviorSubject(convertToParamMap({}));
  const api = { list: vi.fn(), suppliers: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks(); restore = stubNativeDialog(); admin.set(true); user.set({ id: 1 }); params.next(convertToParamMap({}));
    api.list.mockReturnValue(of(healthPage([vaccineItem], 1, 2)));
    api.suppliers.mockReturnValue(of([{ id: 4, name: 'Proveedor A', status: 'inactive' }]));
  });
  afterEach(() => { fixture?.destroy(); restore(); });
  async function setup(kind: HealthCatalogKind = 'vaccines') {
    await TestBed.configureTestingModule({ imports: [CatalogListPage], providers: [
      provideRouter([]), { provide: AuthStore, useValue: { user, isAdmin: () => admin() } }, { provide: HealthCatalogsApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { data: { catalogKind: kind }, queryParamMap: params.value }, queryParamMap: params } },
    ] }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(async (_commands, extras) => {
      params.next(convertToParamMap(Object.fromEntries(Object.entries(extras?.queryParams ?? {}).filter(([, value]) => value !== null))));
      return true;
    });
    fixture = TestBed.createComponent(CatalogListPage); fixture.detectChanges(); await settle();
    return fixture.componentInstance;
  }
  async function settle() { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }

  it('renders vaccine metadata and lazy creation/detail links without unit-scoped filters', async () => {
    const page = await setup();
    expect(api.suppliers).toHaveBeenCalledWith(false);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('VAC-01');
    expect(fixture.nativeElement.querySelector('.detail-cell a').getAttribute('href')).toContain(vaccineItem.id);
    expect(fixture.nativeElement.querySelector('.page-heading a').getAttribute('href')).toBe('/administracion/manejo-lotes/vacunacion/nuevo');
    expect(page.applied()).not.toHaveProperty('production_unit_id');
    expect(fixture.nativeElement.querySelector('a[href*="inventario/existencias"]')).toBeNull();
  });
  it('renders medication snapshots without inventing status, SKU or unsupported detail actions', async () => {
    api.list.mockReturnValue(of(healthPage([medicineItem])));
    await setup('medicines');
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Proveedor al registrar');
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('María al registrar');
    expect(fixture.nativeElement.querySelector('.status')).toBeNull(); expect(fixture.nativeElement.querySelector('.detail-cell')).toBeNull();
    expect(fixture.nativeElement.querySelector('.page-heading a').textContent).toContain('Nuevo medicamento');
    expect(fixture.nativeElement.querySelector('.name-cell a')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('pendiente de preparación');
  });
  it('applies only filter drafts requested by the user and retains applied criteria while paginating', async () => {
    const page = await setup();
    page.openFilters(document.createElement('button'));
    page.draft.setValue({ supplier: '4', status: 'inactive', sku: 'VAC-01' });
    expect(api.list).toHaveBeenCalledTimes(1);
    await page.applyFilters(); await settle();
    expect(api.list).toHaveBeenLastCalledWith('vaccines', expect.objectContaining({ supplier: '4', status: 'inactive', sku: 'VAC-01', page: 1 }));
    await page.changePage(2); await settle();
    expect(api.list).toHaveBeenLastCalledWith('vaccines', expect.objectContaining({ supplier: '4', status: 'inactive', page: 2 }));
    page.openFilters(document.createElement('button')); page.clearDraft();
    expect(page.filterCount()).toBe(3);
    await page.clearCriteria(); await settle(); expect(page.filterCount()).toBe(0);
  });
  it('returns search to page one, represents empty results and recovers independent supplier failures', async () => {
    api.suppliers.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    const page = await setup();
    expect(page.state()).toBe('success'); expect(page.suppliersError()).not.toBeNull();
    page.search.setValue('  desconocido  ', { emitEvent: false }); api.list.mockReturnValue(of(healthPage<CatalogRecord>([])));
    await page.searchRecords(); await settle();
    expect(page.state()).toBe('empty'); expect(page.applied().search).toBe('desconocido');
    expect(fixture.nativeElement.textContent).toContain('No hay coincidencias');
    await page.loadSuppliers(); expect(page.suppliersError()).toBeNull();
  });
  it('ignores replaced requests and old errors after identity changes', async () => {
    const old = new Subject<HealthPage<CatalogRecord>>(); api.list.mockReturnValueOnce(old);
    const page = await setup(); await page.load(); await settle();
    old.next(healthPage([{ ...vaccineItem, name: 'Old' }])); await settle();
    expect(page.records()[0].name).toBe('Vacuna A');
    const pending = new Subject<HealthPage<CatalogRecord>>(); api.list.mockReturnValueOnce(pending); const loading = page.load();
    user.set({ id: 2 }); admin.set(false); await settle();
    pending.error(new HttpErrorResponse({ status: 500 })); await loading;
    expect(page.state()).toBe('forbidden'); expect(page.records()).toEqual([]); expect(page.error()).toBeNull();
  });
});
