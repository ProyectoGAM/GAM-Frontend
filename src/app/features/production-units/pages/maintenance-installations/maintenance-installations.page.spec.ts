import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AdminUnitContextService } from '../../../admin/services/admin-unit-context.service';
import { ProductionUnitsService } from '../../services/production-units.service';
import { maintenanceHouse } from '../../testing/maintenance-fixtures';
import { MaintenanceInstallationsPage } from './maintenance-installations.page';

describe('MaintenanceInstallationsPage', () => {
  let fixture: ComponentFixture<MaintenanceInstallationsPage>;
  let poultry: ReturnType<typeof vi.fn>;
  let feed: ReturnType<typeof vi.fn>;
  const selectedId = signal<number | null>(null);
  beforeEach(() => {
    selectedId.set(null);
    poultry = vi.fn().mockReturnValue(of([{ ...maintenanceHouse, productionUnit: maintenanceHouse.production_unit }]));
    feed = vi.fn().mockReturnValue(of([{ ...maintenanceHouse, id: 23, name: 'Planta Santa Clara', type: 'feed', status: 'inactive',
      productionUnit: { ...maintenanceHouse.production_unit, id: 8, name: 'Santa Clara' } }]));
    TestBed.configureTestingModule({ imports: [MaintenanceInstallationsPage], providers: [provideRouter([]),
      { provide: ProductionUnitsService, useValue: { listAllPoultryHouses: poultry, listAllFeedPlants: feed } },
      { provide: AdminUnitContextService, useValue: { selectedId, selectedUnit: () => selectedId() === 7 ? maintenanceHouse.production_unit : null } },
    ] });
  });
  function render(): void { fixture = TestBed.createComponent(MaintenanceInstallationsPage); fixture.detectChanges(); }

  it('offers poultry and feed installation histories, including inactive installations', () => {
    render();
    expect(fixture.nativeElement.textContent).toContain('Galpón Norte'); expect(fixture.nativeElement.textContent).toContain('Planta Santa Clara');
    const links = [...fixture.nativeElement.querySelectorAll('.installation-card')] as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/administracion/ubicaciones/mantenimiento/7/galpon/22', '/administracion/ubicaciones/mantenimiento/8/galpon/23']);
  });

  it('respects the global UP and filters by type and search without mutating stock or lots', () => {
    render(); selectedId.set(7); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Planta Santa Clara');
    selectedId.set(null); fixture.componentInstance.type.set('feed'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Galpón Norte');
    fixture.componentInstance.type.set('all'); fixture.componentInstance.query.set('galpon'); fixture.detectChanges();
    expect(fixture.componentInstance.visibleInstallations()).toHaveLength(1);
    fixture.componentInstance.query.set('sin coincidencia'); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Sin instalaciones');
    expect(poultry).toHaveBeenCalledOnce(); expect(feed).toHaveBeenCalledOnce();
  });

  it('distinguishes directory errors from empty data and can retry', () => {
    feed.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 }))); render();
    expect(fixture.nativeElement.textContent).toContain('No tenés permiso');
    expect(fixture.nativeElement.textContent).not.toContain('Sin instalaciones');
    feed.mockReturnValue(of([])); fixture.componentInstance.load(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Galpón Norte');
  });
});
