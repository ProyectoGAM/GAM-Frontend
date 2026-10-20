import { inventoryRoutes } from './inventory.routes';

describe('inventory routes', () => {
  it('keeps the four administrative entries and the internal screens', () => {
    expect(inventoryRoutes.map((route) => route.path)).toEqual(['presentaciones-huevos', 'existencias', 'movimientos', 'ajustes-y-perdidas', 'donaciones']);
    expect(inventoryRoutes[1].children?.map((route) => route.path)).toEqual(['', 'ubicaciones', 'huevos']);
  });
});
