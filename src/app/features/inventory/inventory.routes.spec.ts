import { inventoryRoutes } from './inventory.routes';

describe('inventory routes', () => {
  it('keeps inventory entries and nested stock screens available', () => {
    expect(inventoryRoutes.map((route) => route.path)).toEqual(['existencias', 'movimientos', 'ajustes-y-perdidas', 'donaciones']);

    const stockRoutes = inventoryRoutes[0].children;
    expect(stockRoutes?.map((route) => route.path)).toEqual(['', 'ubicaciones', 'huevos']);
    expect(stockRoutes?.find((route) => route.path === 'ubicaciones')?.loadComponent).toBeTypeOf('function');
    expect(
      stockRoutes
        ?.find((route) => route.path === 'huevos')
        ?.children?.find((route) => route.path === '')
        ?.loadComponent,
    ).toBeTypeOf('function');
    expect(inventoryRoutes.find((route) => route.path === 'donaciones')?.loadComponent).toBeTypeOf('function');
  });
});
