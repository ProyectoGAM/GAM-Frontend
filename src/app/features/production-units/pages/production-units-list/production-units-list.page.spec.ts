import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, RouterLink, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ProductionUnitsService } from '../../services/production-units.service';
import { ProductionUnitsListPage } from './production-units-list.page';

describe('ProductionUnitsListPage', () => {
  let fixture: ComponentFixture<ProductionUnitsListPage>;
  let listAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listAll = vi.fn();
    TestBed.configureTestingModule({
      imports: [ProductionUnitsListPage],
      providers: [provideRouter([]), { provide: ProductionUnitsService, useValue: { listAll } }],
    });
  });

  function render(): void {
    fixture = TestBed.createComponent(ProductionUnitsListPage);
    fixture.detectChanges();
  }

  it('renders unit name and locality with its department', () => {
    listAll.mockReturnValue(of([{
      id: 7,
      name: 'Granja Norte',
      status: 'active',
      locality: { name: 'San José', department: { name: 'San José' } },
    }]));

    render();

    expect(fixture.nativeElement.textContent).toContain('Granja Norte');
    expect(fixture.nativeElement.textContent).toContain('San José, San José');
  });

  it('makes the whole production-unit card a keyboard and touch navigation link', () => {
    listAll.mockReturnValue(of([{
      id: 12,
      name: 'Granja Sur',
      status: 'active',
      locality: { name: 'Pando', department: { name: 'Canelones' } },
    }]));

    render();

    const cardLink = fixture.nativeElement.querySelector('a.unit-card');
    expect(cardLink).not.toBeNull();
    expect(cardLink.getAttribute('href')).toBe('/administracion/ubicaciones/unidades-productivas/12');
    expect(cardLink.getAttribute('aria-label')).toBe('Ver unidad productiva activa Granja Sur');
  });

  it('separates active and inactive units into accessible grids', () => {
    listAll.mockReturnValue(of([
      { id: 1, name: 'Granja Activa', status: 'active', locality: { name: 'Pando', department: { name: 'Canelones' } } },
      { id: 2, name: 'Granja Inactiva', status: 'inactive', locality: { name: 'Libertad', department: { name: 'San José' } } },
    ]));

    render();

    const activeGroup = fixture.nativeElement.querySelector('[aria-labelledby="active-units-title"]');
    const inactiveGroup = fixture.nativeElement.querySelector('[aria-labelledby="inactive-units-title"]');
    expect(activeGroup.querySelectorAll('a.unit-card')).toHaveLength(1);
    expect(inactiveGroup.querySelectorAll('a.unit-card')).toHaveLength(1);
    expect(activeGroup.textContent).toContain('Granja Activa');
    expect(inactiveGroup.textContent).toContain('Granja Inactiva');
    expect(inactiveGroup.querySelector('.inactive-label')?.textContent).toBe('Inactiva');
    expect(inactiveGroup.querySelector('a.unit-card')?.getAttribute('href'))
      .toBe('/administracion/ubicaciones/unidades-productivas/2');
  });

  it('keeps an inactive grid visible when all units are active', () => {
    listAll.mockReturnValue(of([{
      id: 1,
      name: 'Granja Activa',
      status: 'active',
      locality: { name: 'Pando', department: { name: 'Canelones' } },
    }]));

    render();

    const inactiveGroup = fixture.nativeElement.querySelector('[aria-labelledby="inactive-units-title"]');
    expect(inactiveGroup.textContent).toContain('No hay unidades inactivas.');
  });

  it('shows the create action and links to the existing creation route', () => {
    listAll.mockReturnValue(of([]));

    render();

    const button = fixture.debugElement.query(By.directive(RouterLink));
    const router = TestBed.inject(Router);

    expect(button.nativeElement.textContent).toContain('Crear unidad productiva');
    expect(router.serializeUrl(button.injector.get(RouterLink).urlTree!))
      .toBe('/administracion/ubicaciones/nueva-unidad-productiva');
  });

  it('shows the empty state when the API returns no units', () => {
    listAll.mockReturnValue(of([]));

    render();

    expect(fixture.nativeElement.textContent).toContain('No hay unidades productivas');
  });

  it('shows an error and retries the request when requested', () => {
    listAll.mockReturnValueOnce(throwError(() => new Error('failed')))
      .mockReturnValueOnce(of([]));

    render();
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar el listado');

    const retryButton = fixture.nativeElement.querySelector('.state-panel ion-button');
    retryButton.click();
    fixture.detectChanges();

    expect(listAll).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('No hay unidades productivas');
  });
});
