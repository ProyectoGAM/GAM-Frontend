import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  Routes,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AlertController } from '@ionic/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { ProductionUnitsService } from '../production-units/services/production-units.service';
import { ProductionUnitCreatePage } from '../production-units/pages/production-unit-create/production-unit-create.page';
import { ProductionUnitDetailPage } from '../production-units/pages/production-unit-detail/production-unit-detail.page';
import { ProductionUnitEditPage } from '../production-units/pages/production-unit-edit/production-unit-edit.page';
import { ProductionUnitsListPage } from '../production-units/pages/production-units-list/production-units-list.page';
import { AdminUnitContextService } from './services/admin-unit-context.service';
import { adminIndexRedirect } from './admin-index.redirect';
import {
  activeAdminGroup,
  firstVisibleAdminPath,
  visibleAdminNavigation,
} from './admin-navigation';
import { adminRoutes } from './admin.routes';
import { AdminSidebarComponent } from './components/admin-sidebar.component';

describe('admin navigation visibility', () => {
  it('shows all thirteen groups to ADMIN and none to a role without grants', () => {
    expect(visibleAdminNavigation({ roles: ['admin'] })).toHaveLength(13);
    expect(visibleAdminNavigation({ roles: ['employee'] })).toHaveLength(0);
    expect(visibleAdminNavigation(null)).toHaveLength(0);
  });

  it('keeps UP modules before global modules in the requested order and includes the suppliers catalogs', () => {
    const navigation = visibleAdminNavigation({ roles: ['admin'] });

    expect(navigation.map((group) => group.label)).toEqual([
      'Resumen',
      'Instalaciones',
      'Lotes',
      'Inventario',
      'Historial',
      'Usuarios',
      'Clientes',
      'Proveedores',
      'Unidades productivas',
      'Manejo de Lotes',
      'Repartos',
      'Alertas y notificaciones',
      'Reportes',
    ]);

    expect(navigation.map((group) => group.section)).toEqual([
      'unit',
      'unit',
      'unit',
      'unit',
      'unit',
      'global',
      'global',
      'global',
      'global',
      'global',
      'global',
      'global',
      'global',
    ]);

    expect(
      navigation
        .find((group) => group.id === 'ubicaciones')
        ?.items.map((item) => item.slug),
    ).toEqual([
      'galpones',
      'plantas-de-racion',
      'nuevo-galpon',
    ]);

    expect(
      navigation
        .find((group) => group.id === 'unidades-productivas')
        ?.items.map((item) => item.slug),
    ).toEqual([
      '',
      'nueva',
    ]);

    const supplierItems = navigation.find(
      (group) => group.id === 'proveedores',
    )?.items;

    expect(
      navigation.reduce(
        (count, group) => count + group.items.length,
        0,
      ),
    ).toBe(28);

    expect(supplierItems).toEqual([
      { label: 'Proveedores', slug: 'proveedores' },
      { label: 'Productos', slug: 'productos' },
      { label: 'Nuevo producto', slug: 'productos/nuevo' },
    ]);

    expect(
      supplierItems?.map((item) => item.label),
    ).not.toContain('Medicamentos');

    expect(
      supplierItems?.map((item) => item.label),
    ).not.toContain('Vacunas');

    expect(
      navigation.find((group) => group.id === 'inventario')?.items,
    ).toContainEqual({
      label: 'Ubicaciones de stock',
      slug: 'existencias/ubicaciones',
    });
  });

  it('shows Planes by permission without exposing unrelated Manejo de Lotes entries', () => {
    const navigation = visibleAdminNavigation({ roles: ['employee'], permissions: ['management-plans.view'] });
    expect(navigation.map((group) => group.id)).toEqual(['manejo-lotes']);
    expect(navigation[0]?.items).toEqual([{ label: 'Planes', slug: 'planes' }]);
    expect(firstVisibleAdminPath({ roles: ['employee'], permissions: ['management-plans.view'] }))
      .toBe('/administracion/manejo-lotes/planes');
  });

  it('uses the existing nested stock-location and product-create routes without duplicate routes', async () => {
    const groups = adminRoutes[0]?.children ?? [];

    const inventoryGroup = groups.find(
      (route) => route.path === 'inventario',
    );

    const inventoryLoader = inventoryGroup
      ?.children?.[0]
      ?.loadChildren as (() => Promise<Routes>) | undefined;

    const inventoryRoutes = await inventoryLoader?.();

    const stockLocations = inventoryRoutes
      ?.find((route) => route.path === 'existencias')
      ?.children
      ?.find((route) => route.path === 'ubicaciones');

    expect(stockLocations?.loadComponent).toBeTypeOf('function');

    const suppliersGroup = groups.find(
      (route) => route.path === 'proveedores',
    );

    const supplierRoutePaths = suppliersGroup
      ?.children
      ?.map((route) => route.path);

    expect(supplierRoutePaths).not.toContain('medicamentos');
    expect(supplierRoutePaths).not.toContain('vacunas');

    const productsRoute = suppliersGroup
      ?.children
      ?.find((route) => route.path === 'productos');

    const productsLoader = productsRoute
      ?.loadChildren as (() => Promise<Routes>) | undefined;

    const productsRoutes = await productsLoader?.();

    expect(
      productsRoutes?.map((route) => route.path),
    ).toEqual([
      '',
      'nuevo',
      ':id/editar',
    ]);

    expect(
      suppliersGroup
        ?.children
        ?.some((route) => route.path === 'productos/nuevo'),
    ).toBe(false);
  });

  it('loads the flock list from the existing Lotes navigation entry', async () => {
    const lotsGroup = (adminRoutes[0]?.children ?? []).find((route) => route.path === 'lotes');
    const lotsRoute = lotsGroup?.children?.find((route) => route.path === 'lotes');
    const loader = lotsRoute?.loadChildren as (() => Promise<Routes>) | undefined;
    const flocksRoutes = await loader?.();

    expect(flocksRoutes?.map((route) => route.path)).toEqual(['nuevo', '']);
    expect(flocksRoutes?.[0]?.loadComponent).toBeTypeOf('function');
  });

  it('renders nested menu slugs as their existing URL segments', () => {
    const groups = visibleAdminNavigation({ roles: ['admin'] });

    TestBed.configureTestingModule({
      imports: [AdminSidebarComponent],
      providers: [
        provideRouter([]),
        {
          provide: AdminUnitContextService,
          useValue: {
            selectedId: () => null,
            state: () => 'ready',
            units: () => [],
            selectedUnit: () => null,
            select: vi.fn(),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(AdminSidebarComponent);

    fixture.componentRef.setInput('groups', groups);
    fixture.componentRef.setInput(
      'firstVisibleRoute',
      firstVisibleAdminPath({ roles: ['admin'] })!,
    );

    fixture.detectChanges();

    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('a'),
    );

    expect(
      links
        .find(
          (link) =>
            link.textContent?.trim() === 'Ubicaciones de stock',
        )
        ?.getAttribute('href'),
    ).toBe(
      '/administracion/inventario/existencias/ubicaciones',
    );

    expect(
      links
        .find(
          (link) =>
            link.textContent?.trim() === 'Nuevo producto',
        )
        ?.getAttribute('href'),
    ).toBe(
      '/administracion/proveedores/productos/nuevo',
    );

    expect(
      links
        .find((link) => link.textContent?.trim() === 'Listado')
        ?.getAttribute('href'),
    ).toBe('/administracion/unidades-productivas');

    fixture.destroy();
  });

  it('loads the production-unit list at the route root and keeps its child routes active', async () => {
    const productionUnit = {
      id: 7,
      name: 'Granja Norte',
      status: 'active' as const,
      locality: {
        id: 4,
        department_id: 2,
        name: 'San José',
        department: { id: 2, name: 'San José' },
      },
    };
    const listAll = vi.fn(() => of([productionUnit]));
    const getById = vi.fn(() => of({ data: productionUnit }));
    const poultryHouses = vi.fn(() => of([]));
    const departments = vi.fn(() => of([{ id: 2, name: 'San José' }]));
    const localities = vi.fn(() => of([productionUnit.locality]));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'administracion', children: adminRoutes[0]?.children ?? [] },
        ]),
        {
          provide: AuthStore,
          useValue: {
            whenReady: async () => undefined,
            isAuthenticated: () => true,
            user: () => ({ roles: ['admin'] }),
          },
        },
        {
          provide: ProductionUnitsService,
          useValue: { listAll, getById, poultryHouses, departments, localities },
        },
        { provide: AlertController, useValue: { create: vi.fn() } },
      ],
    });

    const harness = await RouterTestingHarness.create();
    const listPage = await harness.navigateByUrl(
      '/administracion/unidades-productivas',
      ProductionUnitsListPage,
    );
    const router = TestBed.inject(Router);
    const activeRoutes = snapshotsFrom(router.routerState.snapshot.root);
    const listSnapshot = activeRoutes.find(
      (snapshot) => snapshot.component === ProductionUnitsListPage,
    );

    expect(listPage).toBeInstanceOf(ProductionUnitsListPage);
    expect(listSnapshot?.routeConfig?.path).toBe('');
    expect(listSnapshot?.params).toEqual({});
    expect(listSnapshot?.paramMap.get('id')).toBeNull();
    expect(listAll).toHaveBeenCalledTimes(1);
    expect(getById).not.toHaveBeenCalled();

    const detailPage = await harness.navigateByUrl(
      '/administracion/unidades-productivas/7',
      ProductionUnitDetailPage,
    );
    expect(detailPage).toBeInstanceOf(ProductionUnitDetailPage);
    expect(getById).toHaveBeenCalledWith(7);

    const editPage = await harness.navigateByUrl(
      '/administracion/unidades-productivas/7/editar',
      ProductionUnitEditPage,
    );
    expect(editPage).toBeInstanceOf(ProductionUnitEditPage);

    const createPage = await harness.navigateByUrl(
      '/administracion/unidades-productivas/nueva',
      ProductionUnitCreatePage,
    );
    expect(createPage).toBeInstanceOf(ProductionUnitCreatePage);
  });

  it('routes the panel entry to the first group and item the user can see', () => {
    expect(
      firstVisibleAdminPath({ roles: ['admin'] }),
    ).toBe('/administracion/resumen');

    expect(
      firstVisibleAdminPath({ roles: ['employee'] }),
    ).toBeNull();
  });

  it('finds the group for a direct route after reload, including query parameters', () => {
    expect(
      activeAdminGroup('/administracion/unidades-productivas'),
    ).toBe('unidades-productivas');

    expect(
      activeAdminGroup(
        '/administracion/ubicaciones/unidades-productivas',
      ),
    ).toBe('unidades-productivas');

    expect(
      activeAdminGroup('/administracion/repartos/repartos'),
    ).toBe('repartos');

    expect(
      activeAdminGroup(
        '/administracion/inventario/existencias?page=2',
      ),
    ).toBe('inventario');

    expect(activeAdminGroup('/auth')).toBeNull();
  });

  it('redirects the empty panel URL to the first visible route', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: {
            user: () => ({ roles: ['admin'] }),
          },
        },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      adminIndexRedirect({} as ActivatedRouteSnapshot),
    );

    expect(
      TestBed.inject(Router).serializeUrl(
        result as ReturnType<Router['parseUrl']>,
      ),
    ).toBe('/administracion/resumen');
  });
});

function snapshotsFrom(snapshot: ActivatedRouteSnapshot): ActivatedRouteSnapshot[] {
  return [snapshot, ...snapshot.children.flatMap((child) => snapshotsFrom(child))];
}
