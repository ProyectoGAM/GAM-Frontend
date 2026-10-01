import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../../production-units/services/production-units.service';
import { FlocksApi } from '../../services/flocks.api';
import { FlockCreatePage } from './flock-create.page';

describe('FlockCreatePage', () => {
  let fixture: ComponentFixture<FlockCreatePage>;
  let create: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  const selectedId = signal<number | null>(7);
  const unit = { id: 7, name: 'Granja El Ombú', status: 'active' as const };
  const house = { id: 22, name: 'Galpón Norte 1', type: 'poultry' as const, status: 'operational' as const, bird_capacity: 1800, current_occupancy: 0 };
  const template = { id: '01J00000000000000000000000', name: 'Ponedoras', status: 'active' as const, published_version: 3 };

  beforeEach(async () => {
    selectedId.set(7);
    create = vi.fn(() => of({ data: { operation_id: 'operation-1' } }));
    TestBed.configureTestingModule({
      imports: [FlockCreatePage],
      providers: [
        provideRouter([]),
        { provide: FlocksApi, useValue: {
          activeBreeds: vi.fn(() => of([{ id: 4, name: 'Hy-Line Brown', status: 'active' }])),
          activeSuppliers: vi.fn(() => of([{ id: 9, name: 'Avícola San José', status: 'active' }])),
          publishedTemplates: vi.fn(() => of([template])), create,
        } },
        { provide: ProductionUnitsService, useValue: { poultryHouses: vi.fn(() => of([house])) } },
        { provide: AdminUnitContextService, useValue: {
          state: signal('ready'), units: signal([unit]), selectedId,
          selectedUnit: computed(() => selectedId() === 7 ? unit : null),
          select: vi.fn((id: number | null) => selectedId.set(id)), load: vi.fn(),
        } },
      ],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(FlockCreatePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function completeFirstStep(): void {
    const page = fixture.componentInstance;
    page.update('code', 'PONEDORAS-A24');
    page.selectHouse('22');
    page.update('entryDate', '2026-09-29');
    page.update('initialQuantity', '1200');
    page.next();
    fixture.detectChanges();
  }

  it('keeps the user on step one until its required data is valid', async () => {
    await render();
    fixture.componentInstance.next();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Revisá los campos señalados.');
    expect(fixture.componentInstance.errors().code).toBeTruthy();
  });

  it('offers only operational houses confirmed as empty', async () => {
    await render();
    const poultryHouses = TestBed.inject(ProductionUnitsService).poultryHouses as ReturnType<typeof vi.fn>;
    poultryHouses.mockReturnValue(of([
      house,
      { ...house, id: 23, current_occupancy: null },
      { ...house, id: 24, current_occupancy: 8 },
      { ...house, id: 25, status: 'maintenance' },
    ]));
    fixture.componentInstance.retryHouses();
    fixture.detectChanges();
    expect(fixture.componentInstance.houses().map((available) => available.id)).toEqual([22]);
  });

  it('shows the three approved steps and creates a flock with the published plan', async () => {
    await render();
    completeFirstStep();
    expect(fixture.componentInstance.step()).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aves y procedencia');

    fixture.componentInstance.selectBreed('4');
    fixture.componentInstance.selectSupplier('9');
    fixture.componentInstance.next();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe(3);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Revisá los datos');

    fixture.componentInstance.update('templateId', template.id);
    fixture.componentInstance.next();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PONEDORAS-A24', poultry_house_id: 22, breed_id: 4,
      supplier_id: 9, plan_template_id: template.id, plan_template_version: 3,
    }), expect.any(String));
    expect(navigateByUrl).toHaveBeenCalledWith('/administracion/lotes/lotes');
  });

  it('allows a written origin and preserves fields when returning to an earlier step', async () => {
    await render();
    completeFirstStep();
    fixture.componentInstance.selectBreed('4');
    fixture.componentInstance.setSource('origin');
    fixture.componentInstance.update('origin', 'Criadero externo');
    fixture.componentInstance.next();
    fixture.componentInstance.editData();
    expect(fixture.componentInstance.step()).toBe(1);
    expect(fixture.componentInstance.draft().origin).toBe('Criadero externo');
    expect(fixture.componentInstance.draft().code).toBe('PONEDORAS-A24');
  });

  it('returns to galpón selection when the global UP changes', async () => {
    await render();
    completeFirstStep();
    selectedId.set(null);
    await fixture.whenStable();
    expect(fixture.componentInstance.step()).toBe(1);
    expect(fixture.componentInstance.draft().houseId).toBeNull();
    expect(fixture.componentInstance.message()).toContain('unidad productiva cambió');
  });

  it('keeps selected options visible when going back and forward', async () => {
    await render();
    completeFirstStep();
    fixture.componentInstance.selectBreed('4');
    fixture.componentInstance.selectSupplier('9');
    fixture.componentInstance.next();
    fixture.componentInstance.update('templateId', template.id);
    fixture.componentInstance.back();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect((host.querySelector('#flock-breed') as HTMLSelectElement).value).toBe('4');
    expect((host.querySelector('#flock-supplier') as HTMLSelectElement).value).toBe('9');
    fixture.componentInstance.next();
    fixture.detectChanges();
    expect((host.querySelector('#flock-template') as HTMLSelectElement).value).toBe(template.id);
  });

  it('prefills the UP and house from a valid house detail link', async () => {
    selectedId.set(null);
    const queryParams = { unitId: '7', houseId: '22' };
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get')
      .mockImplementation((name) => queryParams[name as keyof typeof queryParams] ?? null);
    await render();

    expect(selectedId()).toBe(7);
    expect(fixture.componentInstance.draft().houseId).toBe(22);
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#flock-house')?.value).toBe('22');
  });
});
