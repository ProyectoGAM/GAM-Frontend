import { convertToParamMap } from '@angular/router';
import { catalogCommand, catalogFilters, catalogQuery } from './health-catalog-presentation';
describe('Health catalogue input rules', () => {
  const value = { name: '  Nombre  ', description: '  Texto  ', sku: ' VAC-01 ', supplier: '4', details: '  ' };
  it('omits inventory units from global vaccine creation and sends no vaccine-only fields for medicines', () => {
    expect(catalogCommand('vaccines', value)).toEqual({ nombre: 'Nombre', descripcion: 'Texto', sku: 'VAC-01', proveedor_id: 4, detalles: null });
    const obsolete = { ...value, unit: 'ml', stock_location_id: 23, quantity: '100' };
    expect(catalogCommand('vaccines', obsolete)).not.toHaveProperty('unidad_base');
    expect(catalogCommand('vaccines', obsolete)).not.toHaveProperty('stock_location_id');
    expect(catalogCommand('vaccines', obsolete)).not.toHaveProperty('quantity');
    expect(catalogCommand('medicines', { ...value, details: 'ignored' })).toEqual({ name: 'Nombre', description: 'Texto', supplier_id: 4 });
  });
  it('sanitizes URL filters, limits server pages and removes unsupported medication filters', () => {
    const params = convertToParamMap({ buscar: ' A ', estado: 'inactive', proveedor: '4', sku: ' VAC ', page: '2' });
    expect(catalogFilters(params, 'vaccines')).toEqual({ search: 'A', status: 'inactive', supplier: '4', sku: 'VAC', page: 2 });
    expect(catalogFilters(params, 'medicines')).toEqual({ search: 'A', status: '', supplier: '4', sku: '', page: 2 });
    expect(catalogFilters(convertToParamMap({ page: '100001', proveedor: '9007199254740993' }), 'vaccines').page).toBe(1);
    expect(catalogFilters(convertToParamMap({ proveedor: '-4' }), 'vaccines').supplier).toBe('');
    expect(catalogQuery({ search: '', supplier: '', status: '', sku: '', page: 1 })).toEqual({ buscar: null, proveedor: null, estado: null, sku: null, page: null });
  });
});
