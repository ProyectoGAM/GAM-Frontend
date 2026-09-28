import { Routes } from '@angular/router';

import { adminRoutes } from '../../admin/admin.routes';

describe('Suppliers routes', () => {
  it('lazy-loads the supplier list, create, and edit routes under Proveedores', async () => {
    const adminGroup = adminRoutes[0]?.children?.find((route) => route.path === 'proveedores');
    const suppliersRoute = adminGroup?.children?.find((route) => route.path === 'proveedores');
    expect(suppliersRoute?.loadChildren).toBeTypeOf('function');

    const lazyRoutes = await (suppliersRoute?.loadChildren as (() => Promise<Routes>) | undefined)?.();
    expect(lazyRoutes?.map((route) => route.path)).toEqual(['', 'nuevo', ':id/editar']);
    expect(lazyRoutes?.every((route) => typeof route.loadComponent === 'function')).toBe(true);
    expect(lazyRoutes?.[2]?.data?.['title']).toBe('Editar proveedor');
  });
});
