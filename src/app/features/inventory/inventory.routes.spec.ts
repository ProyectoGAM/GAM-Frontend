import { inventoryRoutes } from './inventory.routes';

describe('inventory routes', () => {
  it('keeps the four administrative entries and the internal screens', () => {
    expect(inventoryRoutes.map((route) => route.path)).toEqual(['existencias', 'movimientos', 'ajustes-y-perdidas', 'donaciones']);
    expect(inventoryRoutes[0].children?.map((route) => route.path)).toEqual(['', 'ubicaciones', 'huevos']);
  });
});
