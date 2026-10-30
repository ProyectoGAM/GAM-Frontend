import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { HealthCatalogsApi } from '../../services/health-catalogs.api';
import { CatalogRecord } from '../../interfaces/health-catalog';
import { medicineItem, vaccineItem } from '../../testing/health-catalog-fixtures';
import { HealthCatalogKind } from '../../types/health-catalog.type';
import { CatalogCreatePage } from './catalog-create.page';

describe('Health catalogue creation', () => {
  let fixture: ComponentFixture<CatalogCreatePage>;
  const admin = signal(true);
  const user = signal({ id: 1 });
  const api = { suppliers: vi.fn(), create: vi.fn() };
  const dismissResult = vi.fn();
  const alert = { present: vi.fn(), dismiss: vi.fn(), onDidDismiss: dismissResult };
  const alerts = { create: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks(); admin.set(true); user.set({ id: 1 });
    api.suppliers.mockReturnValue(of([{ id: 4, name: 'Proveedor A', status: 'active' }]));
    api.create.mockReturnValue(of(vaccineItem)); alerts.create.mockResolvedValue(alert);
    dismissResult.mockResolvedValue({ role: 'cancel' }); alert.present.mockResolvedValue(undefined);
  });
  afterEach(() => fixture?.destroy());
  async function setup(kind: HealthCatalogKind = 'vaccines', query: Record<string, string> = {}) {
    await TestBed.configureTestingModule({ imports: [CatalogCreatePage], providers: [
      provideRouter([]), { provide: AuthStore, useValue: { user, isAdmin: () => admin() } },
      { provide: HealthCatalogsApi, useValue: api }, { provide: AlertController, useValue: alerts },
      { provide: ActivatedRoute, useValue: { snapshot: { data: { catalogKind: kind }, queryParamMap: convertToParamMap({ buscar: 'previo', ...query }) } } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(CatalogCreatePage); fixture.detectChanges(); await settle();
    return fixture.componentInstance;
  }
  async function settle() { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  function fill() { fixture.componentInstance.form.setValue({ name: '  Vacuna A  ', description: '  Descripción  ', supplier: '4', sku: ' VAC-01 ', details: '' }); }

  it.each<HealthCatalogKind>(['vaccines', 'medicines'])('keeps the filtered catalog as the return destination for direct %s creation', async (kind) => {
    const page = await setup(kind, { from: 'https://example.com', returnTo: '//example.com', proveedor: '4', page: '2' });
    expect(fixture.nativeElement.querySelector('a.back').getAttribute('href')).toBe(page.config.path + '?buscar=previo&proveedor=4&page=2');
    fill(); await page.submit(); await settle();
    expect(fixture.nativeElement.querySelector('.success .button').getAttribute('href')).toBe(page.config.path + '?buscar=previo&proveedor=4&page=2');
    expect(fixture.nativeElement.textContent).not.toContain('Volver a Nuevo producto');
  });

  it.each<HealthCatalogKind>(['vaccines', 'medicines'])('keeps global catalog help collapsed beside the data heading for %s', async (kind) => {
    await setup(kind);
    const heading = fixture.nativeElement.querySelector('.section-heading') as HTMLElement;
    expect(heading.querySelector('h2')?.textContent).toContain(kind === 'vaccines' ? 'Datos de la vacuna' : 'Datos del medicamento');
    const trigger = heading.querySelector('app-info-help button') as HTMLButtonElement;
    const tooltip = heading.querySelector('[role="tooltip"]') as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(tooltip.hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('.info-note')).toBeNull();
    trigger.click(); await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toContain('sin ubicación ni control de existencias físicas');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('creates a global vaccine without stock controls or a unit payload, retaining normalized catalog data and idempotency', async () => {
    const page = await setup();
    expect(fixture.nativeElement.querySelector('#health-unit')).toBeNull();
    expect(fixture.nativeElement.querySelector('#health-provider-title')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.form-card')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('label[for="health-sku"]').textContent).toContain('Código de la vacuna');
    fill(); await page.submit(); await settle();
    expect(api.suppliers).toHaveBeenCalledWith(true);
    expect(api.create).toHaveBeenCalledWith('vaccines', { nombre: 'Vacuna A', descripcion: 'Descripción', proveedor_id: 4, sku: 'VAC-01', detalles: null }, expect.any(String));
    expect(page.created()?.id).toBe(vaccineItem.id); expect(fixture.nativeElement.textContent).toContain('Vacuna creada');
    expect(fixture.nativeElement.querySelector('.action-bar')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No requiere ubicación');
    expect(fixture.nativeElement.querySelector('a[href*="ajustes-y-perdidas"]')).toBeNull();
    await page.submit(); expect(api.create).toHaveBeenCalledTimes(1);
  });
  it('creates medicine with only the three contracted fields and no stock, SKU or unit fields', async () => {
    api.create.mockReturnValue(of(medicineItem));
    const page = await setup('medicines'); fill(); await page.submit(); await settle();
    expect(api.create).toHaveBeenCalledWith('medicines', { name: 'Vacuna A', description: 'Descripción', supplier_id: 4 }, expect.any(String));
    expect(fixture.nativeElement.querySelector('#health-sku')).toBeNull(); expect(fixture.nativeElement.querySelector('#health-unit')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Medicamento creado');
    const stockLink = Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).find((item) => item.textContent?.includes('Ingresar stock'));
    expect(stockLink).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('No requiere ubicación');
    expect(page.created()?.productId).toBeNull();
  });
  it('rejects whitespace, unknown suppliers and oversized text before posting', async () => {
    const page = await setup(); fill();
    page.form.controls.name.setValue('  '); await page.submit(); expect(api.create).not.toHaveBeenCalled();
    fill(); page.form.controls.supplier.setValue('999'); await page.submit(); expect(api.create).not.toHaveBeenCalled();
    fill(); page.form.controls.description.setValue('x'.repeat(5001)); await page.submit(); expect(api.create).not.toHaveBeenCalled();
    expect(page.form.controls.description.hasError('maxlength')).toBe(true);
  });
  it('keeps supplier failures separate, blocks normal creation, and recovers without losing form content', async () => {
    api.suppliers.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    const page = await setup(); fill(); await page.submit();
    expect(page.suppliersError()).toContain('conectar'); expect(api.create).not.toHaveBeenCalled();
    await page.loadSuppliers(); expect(page.form.controls.name.value).toBe('  Vacuna A  ');
    await page.submit(); expect(page.created()).not.toBeNull();
  });
  it('maps Spanish vaccine validation fields to the right inputs and preserves edited values', async () => {
    api.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { nombre: ['Nombre duplicado.'], proveedor_id: ['Revisa proveedor.'], detalles: ['Revisa detalles.'] } } })));
    const page = await setup(); fill(); await page.submit(); await settle();
    expect(page.fieldError(page.form.controls.name)).toBe('Nombre duplicado.');
    expect(page.fieldError(page.form.controls.supplier)).toBe('Revisa proveedor.');
    expect(page.fieldError(page.form.controls.details)).toBe('Revisa detalles.');
    expect(page.form.controls.sku.value).toBe(' VAC-01 '); expect(page.uncertain()).toBe(false);
    expect(fixture.nativeElement.querySelector('details').open).toBe(true);
    expect(fixture.nativeElement.querySelector('#health-name').getAttribute('aria-invalid')).toBe('true');
  });
  it('freezes uncertain retries and reuses the original body/key even if form values or supplier reads change', async () => {
    api.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 }))).mockReturnValueOnce(of(vaccineItem));
    const page = await setup(); fill(); await page.submit(); fixture.detectChanges();
    expect(page.uncertain()).toBe(true); expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    const first = api.create.mock.calls[0]; page.form.controls.name.setValue('Changed programmatically');
    page.suppliersError.set('Offline'); await page.submit();
    expect(api.create.mock.calls[1]).toEqual(first); expect(page.created()?.name).toBe('Vacuna A');
  });
  it('blocks duplicate submits and navigation during a pending command, then discards old-actor results', async () => {
    const pending = new Subject<CatalogRecord>(); api.create.mockReturnValue(pending);
    const page = await setup(); fill(); const saving = page.submit(); await page.submit();
    expect(api.create).toHaveBeenCalledTimes(1); expect(page.canLeave()).toBe(false);
    user.set({ id: 2 }); admin.set(false); await settle();
    pending.next(vaccineItem); await saving;
    expect(page.created()).toBeNull(); expect(page.form.controls.name.value).toBe('');
    expect(page.saving()).toBe(false); await page.submit(); expect(api.create).toHaveBeenCalledTimes(1);
  });
  it('unlocks conflicts for correction and refreshes supplier eligibility without treating them as uncertain writes', async () => {
    api.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const page = await setup(); fill(); await page.submit(); await settle();
    expect(page.uncertain()).toBe(false); expect(page.locked()).toBe(false);
    expect(page.error()).toContain('código'); expect(api.suppliers).toHaveBeenCalledTimes(2);
  });
  it('confirms leaving edited drafts, permits untouched/successful pages, and honors cancellation', async () => {
    const page = await setup(); expect(page.canLeave()).toBe(true);
    fill(); page.form.markAsDirty(); expect(await page.canLeave()).toBe(false);
    expect(alerts.create).toHaveBeenCalledWith(expect.objectContaining({ header: '¿Salir sin guardar?' }));
    dismissResult.mockResolvedValue({ role: 'discard' }); expect(await page.canLeave()).toBe(true);
    await page.submit(); expect(page.canLeave()).toBe(true);
  });
});
