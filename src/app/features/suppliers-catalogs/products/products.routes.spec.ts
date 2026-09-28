import { Routes } from '@angular/router';

import { adminRoutes } from '../../admin/admin.routes';

describe('Products catalog routes', () => {
  it('lazy-loads the product list, create and real edit routes under Proveedores', async () => {
    const adminGroup = adminRoutes[0]?.children?.find((route) => route.path === 'proveedores');
    const productsRoute = adminGroup?.children?.find((route) => route.path === 'productos');
    expect(productsRoute?.loadChildren).toBeTypeOf('function');

    const lazyRoutes = await (productsRoute?.loadChildren as (() => Promise<Routes>) | undefined)?.();
    expect(lazyRoutes?.map((route) => route.path)).toEqual(['', 'nuevo', ':id/editar']);
    expect(lazyRoutes?.[2]?.loadComponent).toBeTypeOf('function');
  });
});
