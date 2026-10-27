import { Routes } from '@angular/router';

import { inventoryRoutes } from './inventory.routes';

describe('Products catalog routes', () => {
  it('lazy-loads the global catalog, create and edit routes under Existencias', async () => {
    const stock = inventoryRoutes.find((route) => route.path === 'existencias');
    const productsRoute = stock?.children?.find((route) => route.path === 'productos');
    expect(productsRoute?.loadChildren).toBeTypeOf('function');

    const lazyRoutes = await (productsRoute?.loadChildren as (() => Promise<Routes>) | undefined)?.();
    expect(lazyRoutes?.map((route) => route.path)).toEqual(['', 'nuevo', ':id/editar']);
    expect(lazyRoutes?.[2]?.loadComponent).toBeTypeOf('function');
  });
});
